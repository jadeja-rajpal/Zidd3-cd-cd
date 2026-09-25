const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

let requestCount = 0;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Dashboard API
app.get("/api/dashboard", (req, res) => {
    requestCount++;
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");

    res.json({
        application: "DevOps Dashboard",
        version: "1.0.0",
        environment: "Local Machine",
        status: "Running",
        docker: "containerized",
        requests: requestCount,
        time: new Date().toLocaleString(),
        services: [
            {
                name: "Application",
                status: "Healthy"
            },
            {
                name: "API",
                status: "Healthy"
            },
            {
                name: "Database",
                status: "Disconnected"
            }
        ]
    });
});

// Health Check
app.get("/api/health", (req, res) => {
    res.json({
        status: "UP",
        message: "Application is healthy",
        timestamp: new Date().toLocaleString()
    });
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 DevOps Dashboard running at http://localhost:${PORT}`);
});
