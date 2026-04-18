const { Router } = require("express");
const { authenticateDownload } = require("../middlewares/auth");
const { exportSnippets } = require("../controllers/snippet");
const { hasOrganizationAccess } = require("../utils/permission");

const app = Router();

app.get("/", authenticateDownload, async (req, res) => {
    const organizationId = req.query.organizationId ? parseInt(req.query.organizationId) : null;

    if (organizationId && !(await hasOrganizationAccess(req.user.id, organizationId))) {
        return res.status(403).json({ code: 403, message: "Access denied to this organization" });
    }

    const snippets = await exportSnippets(req.user.id, organizationId);

    const today = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="nexterm-snippets-${today}.json"`);
    res.send(JSON.stringify(snippets, null, 2));
});

module.exports = app;
