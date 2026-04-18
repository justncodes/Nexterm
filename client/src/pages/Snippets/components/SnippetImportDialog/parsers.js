import yaml from "js-yaml";

const normalizeSnippet = (raw, index) => {
    if (!raw || typeof raw !== "object") {
        return { error: `Item ${index + 1}: expected an object` };
    }

    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const command = typeof raw.command === "string" ? raw.command : "";
    if (!name) return { error: `Item ${index + 1}: missing "name"` };
    if (!command) return { error: `Item ${index + 1}: missing "command"` };

    const snippet = { name, command };
    if (typeof raw.description === "string") snippet.description = raw.description;
    if (Array.isArray(raw.osFilter) && raw.osFilter.length > 0) {
        snippet.osFilter = raw.osFilter.map(v => String(v).trim()).filter(Boolean);
    }

    return { snippet };
};

const normalizeArray = (arr) => {
    const snippets = [];
    const errors = [];
    arr.forEach((item, i) => {
        const { snippet, error } = normalizeSnippet(item, i);
        if (error) errors.push(error);
        else snippets.push(snippet);
    });
    return { snippets, errors };
};

export const parseJSON = (text) => {
    try {
        const data = JSON.parse(text);
        const arr = Array.isArray(data) ? data : Array.isArray(data?.snippets) ? data.snippets : null;
        if (!arr) return { snippets: [], errors: ["JSON must be an array or an object with a 'snippets' array"] };
        return normalizeArray(arr);
    } catch (e) {
        return { snippets: [], errors: [`Invalid JSON: ${e.message}`] };
    }
};

export const parseYAML = (text) => {
    try {
        const data = yaml.load(text);
        const arr = Array.isArray(data) ? data : Array.isArray(data?.snippets) ? data.snippets : null;
        if (!arr) return { snippets: [], errors: ["YAML must be a list or a mapping with a 'snippets' list"] };
        return normalizeArray(arr);
    } catch (e) {
        return { snippets: [], errors: [`Invalid YAML: ${e.message}`] };
    }
};

const splitCSVLine = (line) => {
    const out = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
            else if (ch === '"') { inQuotes = false; }
            else cur += ch;
        } else {
            if (ch === '"') inQuotes = true;
            else if (ch === ',') { out.push(cur); cur = ""; }
            else cur += ch;
        }
    }
    out.push(cur);
    return out;
};

export const parseCSV = (text) => {
    const lines = text.split(/\r?\n/).filter(l => l.length > 0);
    if (lines.length === 0) return { snippets: [], errors: ["Empty CSV"] };

    const header = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
    const required = ["name", "command"];
    const missing = required.filter(r => !header.includes(r));
    if (missing.length > 0) {
        return { snippets: [], errors: [`CSV missing required column(s): ${missing.join(", ")}`] };
    }

    const nameIdx = header.indexOf("name");
    const commandIdx = header.indexOf("command");
    const descriptionIdx = header.indexOf("description");
    const osFilterIdx = header.indexOf("osfilter");

    const items = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = splitCSVLine(lines[i]);
        const item = { name: cols[nameIdx], command: cols[commandIdx] };
        if (descriptionIdx >= 0 && cols[descriptionIdx]) item.description = cols[descriptionIdx];
        if (osFilterIdx >= 0 && cols[osFilterIdx]) {
            item.osFilter = cols[osFilterIdx].split("|").map(s => s.trim()).filter(Boolean);
        }
        items.push(item);
    }
    return normalizeArray(items);
};

export const autoParse = (text, filename) => {
    const ext = filename ? filename.toLowerCase().split(".").pop() : null;
    if (ext === "yaml" || ext === "yml") return parseYAML(text);
    if (ext === "csv") return parseCSV(text);
    if (ext === "json") return parseJSON(text);

    const json = parseJSON(text);
    if (json.snippets.length > 0) return json;
    const yml = parseYAML(text);
    if (yml.snippets.length > 0) return yml;
    const csv = parseCSV(text);
    if (csv.snippets.length > 0) return csv;

    return json.errors.length > 0 ? json : { snippets: [], errors: ["Could not parse as JSON, YAML, or CSV"] };
};

export const parseByFormat = (text, format, filename) => {
    if (format === "json") return parseJSON(text);
    if (format === "yaml") return parseYAML(text);
    if (format === "csv") return parseCSV(text);
    return autoParse(text, filename);
};
