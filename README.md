# CI/CD Pipeline with GitHub Actions, Docker, AWS ECR & EKS

This project demonstrates a complete **CI/CD pipeline** using:

* GitHub Actions
* Gitleaks
* Docker
* Trivy
* Amazon ECR
* Amazon EKS
* Kubernetes

Every push to the `main` branch automatically triggers the pipeline.

---

## Architecture

```text
Developer
    |
    | git push
    v
GitHub Repository
    |
    v
GitHub Actions
    |
    +----------------------+
    |                      |
    v                      v
Gitleaks              AWS Credentials
Secret Scan                |
                            v
                       Amazon ECR
    |                       |
    v                       |
Docker Build               |
    |                       |
    v                       |
Trivy Scan                  |
    |                       |
    v                       |
Push Docker Image ----------+
                            |
                            v
                    Amazon EKS Cluster
                            |
                            v
                   Kubernetes Deployment
                            |
                            v
                         Pods
```

---

# Pipeline Flow

The pipeline consists of two stages:

```text
CI → CD
```

### CI — Continuous Integration

The CI stage performs:

1. Checkout source code
2. Scan repository for secrets using Gitleaks
3. Configure AWS credentials
4. Login to Amazon ECR
5. Build Docker image
6. Scan Docker image using Trivy
7. Push Docker image to ECR

### CD — Continuous Deployment

The CD stage performs:

1. Configure AWS credentials
2. Configure `kubectl`
3. Connect to the EKS cluster
4. Update Kubernetes deployment with the new Docker image
5. Wait for rollout completion

---

# GitHub Actions Workflow

The workflow is triggered whenever code is pushed to the `main` branch.

```yaml
on:
  push:
    branches:
      - main
```

---

# Environment Variables

The pipeline uses the following environment variables:

```yaml
env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: cicd-first
  EKS_CLUSTER: zidd-3
  ECR_REGISTRY: 462096274890.dkr.ecr.us-east-1.amazonaws.com
```

| Variable         | Purpose                                 |
| ---------------- | --------------------------------------- |
| `AWS_REGION`     | AWS region where resources are deployed |
| `ECR_REPOSITORY` | Docker image repository in ECR          |
| `EKS_CLUSTER`    | EKS cluster name                        |
| `ECR_REGISTRY`   | Amazon ECR registry URL                 |

---

# CI — Continuous Integration

## 1. Checkout Code

GitHub Actions checks out the latest source code.

```yaml
- name: Checkout Code
  uses: actions/checkout@v4
```

This makes the repository files available to the GitHub Actions runner.

---

## 2. Gitleaks Secret Scanning

Gitleaks scans the repository for accidentally committed secrets.

```yaml
- name: Run Gitleaks Scan
  uses: gitleaks/gitleaks-action@v2
```

It can detect credentials such as:

```text
AWS Access Keys
API Keys
Tokens
Passwords
Private Keys
```

The goal is to prevent sensitive credentials from being pushed further through the pipeline.

---

## 3. Configure AWS

GitHub Actions authenticates with AWS using GitHub Secrets.

```yaml
- name: Configure AWS
  uses: aws-actions/configure-aws-credentials@v4
  with:
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    aws-region: ${{ env.AWS_REGION }}
```

The following secrets must be configured in GitHub:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

These credentials allow GitHub Actions to interact with AWS.

---

# 4. Login to Amazon ECR

The pipeline logs Docker into Amazon ECR.

```yaml
- name: Login to ECR
  uses: aws-actions/amazon-ecr-login@v2
```

After authentication, Docker can push images to the ECR repository.

---

# 5. Build Docker Image

The Docker image is tagged using the first 7 characters of the Git commit SHA.

```bash
IMAGE=$ECR_REGISTRY/$ECR_REPOSITORY:${GITHUB_SHA::7}

docker build -t $IMAGE .
```

For example:

```text
462096274890.dkr.ecr.us-east-1.amazonaws.com/cicd-first:a1b2c3d
```

Using the Git commit SHA gives every image a unique version.

```text
Commit A → a1b2c3d
Commit B → f4e5d6a
Commit C → 92ab731
```

This makes image versions traceable back to source-code commits.

---

# 6. Trivy Container Security Scan

After building the Docker image, Trivy scans it for vulnerabilities.

```yaml
- name: Run Trivy vulnerability scanner
  uses: aquasecurity/trivy-action@v0.36.0
  with:
    image-ref: '${{ env.ECR_REGISTRY }}/${{ env.ECR_REPOSITORY }}:${{ env.IMAGE_TAG }}'
    format: 'table'
    exit-code: '0'
    ignore-unfixed: true
    vuln-type: 'os,library'
    severity: 'CRITICAL,HIGH'
```

The scan checks:

```text
OS packages
Application libraries
HIGH vulnerabilities
CRITICAL vulnerabilities
```

Currently:

```yaml
exit-code: '0'
```

means the pipeline does **not fail** even if HIGH or CRITICAL vulnerabilities are found.

The vulnerabilities are displayed in the GitHub Actions logs.

---

# 7. Push Docker Image to ECR

After the security scan, the Docker image is pushed to Amazon ECR.

```bash
IMAGE=$ECR_REGISTRY/$ECR_REPOSITORY:${GITHUB_SHA::7}

docker push $IMAGE
```

The final image is stored in:

```text
Amazon ECR
    |
    └── cicd-first
          |
          ├── a1b2c3d
          ├── f4e5d6a
          └── 92ab731
```

---

# CD — Continuous Deployment

The CD job starts only after the CI job succeeds.

```yaml
needs: ci
```

Therefore:

```text
CI
 |
 | success
 v
CD
```

If CI fails, CD will not run.

---

# 8. Configure AWS for Deployment

The CD stage authenticates with AWS again.

```yaml
- name: Configure AWS
  uses: aws-actions/configure-aws-credentials@v4
```

This allows the workflow to access the EKS cluster.

---

# 9. Configure kubectl

The workflow generates the Kubernetes configuration for the EKS cluster.

```bash
aws eks update-kubeconfig \
  --region $AWS_REGION \
  --name $EKS_CLUSTER
```

The command connects `kubectl` to:

```text
EKS Cluster: zidd-3
Region: us-east-1
```

After this, GitHub Actions can execute Kubernetes commands against the cluster.

---

# 10. Deploy New Image to EKS

The deployment image is updated using:

```bash
kubectl set image deployment/cicd-first \
  cicd-first=$IMAGE
```

For example:

```text
Old image:
cicd-first:a1b2c3d

        ↓

New image:
cicd-first:f4e5d6a
```

Kubernetes then performs a rolling update of the pods.

---

# 11. Verify Deployment

The pipeline waits for Kubernetes to complete the rollout.

```bash
kubectl rollout status deployment/cicd-first --timeout=5m
```

If the deployment successfully rolls out:

```text
Deployment successful
```

If Kubernetes cannot successfully roll out the new version within 5 minutes:

```text
Pipeline fails
```

---

# Complete Pipeline

The complete flow is:

```text
git push
    |
    v
GitHub Actions
    |
    v
Checkout Code
    |
    v
Gitleaks
    |
    v
Configure AWS
    |
    v
Login to ECR
    |
    v
Docker Build
    |
    v
Trivy Scan
    |
    v
Push Image to ECR
    |
    v
CI Complete
    |
    v
CD Starts
    |
    v
Configure kubectl
    |
    v
Connect to EKS
    |
    v
kubectl set image
    |
    v
Kubernetes Rolling Update
    |
    v
Rollout Verification
    |
    v
Application Running
```

---

# Required AWS Resources

Before running the pipeline, the following resources should exist:

### Amazon ECR

Repository:

```text
cicd-first
```

### Amazon EKS

Cluster:

```text
zidd-3
```

Region:

```text
us-east-1
```

### Kubernetes Deployment

The EKS cluster should already contain:

```text
deployment/cicd-first
```

The container inside the deployment should be named:

```text
cicd-first
```

This is important because the pipeline executes:

```bash
kubectl set image deployment/cicd-first \
  cicd-first=$IMAGE
```

---

# GitHub Secrets

Go to:

```text
GitHub Repository
    → Settings
    → Secrets and variables
    → Actions
```

Add:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

These credentials should have only the AWS permissions required by the pipeline.

---

# Production Environment

The CD job uses:

```yaml
environment: production
```

This allows GitHub repository administrators to configure environment-specific controls such as:

* Environment secrets
* Required reviewers
* Deployment protection rules

The production environment can therefore be used as an additional approval/security layer before deployment.

---

# Docker Image Versioning

This pipeline does not use only `latest`.

Instead, it uses the Git commit SHA:

```bash
${GITHUB_SHA::7}
```

Example:

```text
cicd-first:8f31a72
```

This provides:

* Unique image versions
* Easy rollback
* Git-to-image traceability
* Better deployment tracking

For example:

```text
Git Commit
8f31a72
    |
    v
Docker Image
cicd-first:8f31a72
    |
    v
ECR
    |
    v
EKS
```

---

# Security Tools

This pipeline includes two security checks:

## Gitleaks

Used for:

```text
Secret Detection
Credential Detection
API Key Detection
```

## Trivy

Used for:

```text
Container Vulnerability Scanning
OS Package Scanning
Application Dependency Scanning
```

Therefore, the pipeline follows a basic:

```text
Code Security
      ↓
Container Security
      ↓
Deployment
```

approach.

---

# Technologies Used

| Technology     | Purpose                |
| -------------- | ---------------------- |
| GitHub         | Source Code            |
| GitHub Actions | CI/CD Automation       |
| Gitleaks       | Secret Scanning        |
| Docker         | Containerization       |
| Trivy          | Vulnerability Scanning |
| Amazon ECR     | Container Registry     |
| Amazon EKS     | Kubernetes Platform    |
| kubectl        | Kubernetes Deployment  |
| AWS            | Cloud Infrastructure   |

---

# Future Improvements

The pipeline can be further improved with:

* AWS IAM OIDC instead of long-lived AWS access keys
* Trivy configured to fail on HIGH/CRITICAL vulnerabilities
* Terraform for AWS infrastructure
* Kubernetes manifests managed through Git
* Helm deployment
* Argo CD / GitOps
* Deployment notifications
* Automated rollback
* Separate staging and production environments
* Manual production approval
* Kubernetes health checks
* Image signing and verification

---

# Result

With this setup, the deployment process becomes:

```text
Developer Push
      ↓
GitHub
      ↓
Gitleaks
      ↓
Docker Build
      ↓
Trivy Scan
      ↓
Amazon ECR
      ↓
Amazon EKS
      ↓
Rolling Deployment
      ↓
Application Updated
```

The objective is to automate the complete path from **Git commit → container image → Kubernetes deployment** using GitHub Actions.
