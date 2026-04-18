import "./styles.sass";
import { useState, useEffect, useMemo } from "react";
import { useSnippets } from "@/common/contexts/SnippetContext.jsx";
import { useScripts } from "@/common/contexts/ScriptContext.jsx";
import SnippetsList from "@/pages/Snippets/components/SnippetsList";
import SnippetDialog from "@/pages/Snippets/components/SnippetDialog";
import SnippetImportDialog from "@/pages/Snippets/components/SnippetImportDialog";
import ScriptsList from "@/pages/Snippets/components/ScriptsList";
import ScriptDialog from "@/pages/Snippets/components/ScriptDialog";
import Button from "@/common/components/Button";
import PageHeader from "@/common/components/PageHeader";
import SelectBox from "@/common/components/SelectBox";
import TabSwitcher from "@/common/components/TabSwitcher";
import { mdiCodeBraces, mdiPlus, mdiScriptText, mdiCloudDownloadOutline, mdiAccount, mdiDomain, mdiFileImportOutline, mdiFileExportOutline } from "@mdi/js";
import { useTranslation } from "react-i18next";
import { getRequest } from "@/common/utils/RequestUtil.js";
import yaml from "js-yaml";

export const Snippets = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState(0); // 0 = snippets, 1 = scripts
    const [snippetDialogOpen, setSnippetDialogOpen] = useState(false);
    const [snippetImportDialogOpen, setSnippetImportDialogOpen] = useState(false);
    const [scriptDialogOpen, setScriptDialogOpen] = useState(false);
    const [editSnippetId, setEditSnippetId] = useState(null);
    const [editScriptId, setEditScriptId] = useState(null);
    const [organizations, setOrganizations] = useState([]);
    const [sources, setSources] = useState([]);
    const [selectedOrganization, setSelectedOrganization] = useState(null);
    const [selectedSource, setSelectedSource] = useState(null);
    const [sourceSnippets, setSourceSnippets] = useState([]);
    const [sourceScripts, setSourceScripts] = useState([]);
    const { allSnippets } = useSnippets();
    const { scripts, loadScripts } = useScripts();

    const snippets = useMemo(() => {
        if (selectedSource !== null) {
            return sourceSnippets.filter(s => s.sourceId === selectedSource);
        }

        if (!allSnippets || allSnippets.length === 0) return [];

        if (selectedOrganization === null) {
            return allSnippets.filter(snippet => snippet.organizationId === null);
        }

        return allSnippets.filter(snippet => snippet.organizationId === selectedOrganization);
    }, [allSnippets, selectedOrganization, selectedSource, sourceSnippets]);

    const displayScripts = useMemo(() => {
        if (selectedSource !== null) {
            return sourceScripts.filter(s => s.sourceId === selectedSource);
        }
        return scripts;
    }, [scripts, selectedSource, sourceScripts]);

    useEffect(() => {
        const fetchOrganizations = async () => {
            try {
                const orgs = await getRequest("organizations");
                setOrganizations(orgs);
            } catch (error) {
                console.error("Failed to load organizations", error);
            }
        };
        fetchOrganizations();
    }, []);

    useEffect(() => {
        const fetchSources = async () => {
            try {
                const sourcesData = await getRequest("sources");
                setSources(sourcesData.filter(s => s.enabled && (s.snippetCount > 0 || s.scriptCount > 0)));
            } catch (error) {
                console.debug("Sources not available", error);
            }
        };
        fetchSources();
    }, []);

    useEffect(() => {
        const fetchSourceContent = async () => {
            try {
                const [snippetsData, scriptsData] = await Promise.all([
                    getRequest("snippets/sources"),
                    getRequest("scripts/sources"),
                ]);
                setSourceSnippets(snippetsData || []);
                setSourceScripts(scriptsData || []);
            } catch (error) {
                console.debug("Source content not available", error);
            }
        };
        fetchSourceContent();
    }, []);

    useEffect(() => {
        if (selectedSource !== null) return;
        if (selectedOrganization) {
            loadScripts(selectedOrganization);
        } else {
            loadScripts();
        }
    }, [selectedOrganization, selectedSource]);

    const organizationOptions = useMemo(() => {
        const options = [
            { value: null, label: t("snippets.page.personal"), icon: mdiAccount },
        ];

        // Add organizations
        organizations.forEach(org => {
            options.push({ value: org.id, label: org.name, icon: mdiDomain });
        });

        sources.forEach(source => {
            options.push({
                value: `source_${source.id}`,
                label: source.name,
                icon: mdiCloudDownloadOutline,
            });
        });

        return options;
    }, [organizations, sources, t]);

    const handleSelectionChange = (value) => {
        if (typeof value === "string" && value.startsWith("source_")) {
            const sourceId = parseInt(value.replace("source_", ""));
            setSelectedSource(sourceId);
            setSelectedOrganization(null);
        } else {
            setSelectedSource(null);
            setSelectedOrganization(value);
        }
    };

    const currentSelection = useMemo(() => {
        if (selectedSource !== null) {
            return `source_${selectedSource}`;
        }
        return selectedOrganization;
    }, [selectedSource, selectedOrganization]);

    const isSourceSelected = selectedSource !== null;

    const openCreateSnippetDialog = () => {
        setEditSnippetId(null);
        setSnippetDialogOpen(true);
    };

    const openEditSnippetDialog = (id) => {
        setEditSnippetId(id);
        setSnippetDialogOpen(true);
    };

    const closeSnippetDialog = () => {
        setSnippetDialogOpen(false);
        setEditSnippetId(null);
    };

    const openCreateScriptDialog = () => {
        setEditScriptId(null);
        setScriptDialogOpen(true);
    };

    const openEditScriptDialog = (id) => {
        setEditScriptId(id);
        setScriptDialogOpen(true);
    };

    const closeScriptDialog = () => {
        setScriptDialogOpen(false);
        setEditScriptId(null);
    };

    const handleCreateClick = () => {
        if (activeTab === 0) {
            openCreateSnippetDialog();
        } else {
            openCreateScriptDialog();
        }
    };

    const [exportMenuPos, setExportMenuPos] = useState(null);

    const handleExportClick = (e) => {
        if (exportMenuPos) {
            setExportMenuPos(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setExportMenuPos({ top: rect.bottom + 6, left: rect.left });
    };

    useEffect(() => {
        if (!exportMenuPos) return;
        const close = () => setExportMenuPos(null);
        requestAnimationFrame(() => document.addEventListener("click", close));
        return () => document.removeEventListener("click", close);
    }, [exportMenuPos]);

    const triggerDownload = (content, filename, mimeType) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const snippetsToCSV = (data) => {
        const escape = (val) => {
            const s = String(val ?? "");
            return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const header = "name,command,description,osFilter";
        const rows = data.map(s =>
            [s.name, s.command, s.description || "", (s.osFilter || []).join("|")].map(escape).join(",")
        );
        return [header, ...rows].join("\n");
    };

    const handleExportSnippets = async (format) => {
        setExportMenuPos(null);
        const params = selectedOrganization ? `?organizationId=${selectedOrganization}` : "";
        const data = await getRequest(`snippets/export${params}`);
        if (!data || data.code) return;

        const today = new Date().toISOString().slice(0, 10);
        const base = `nexterm-snippets-${today}`;

        if (format === "yaml") {
            triggerDownload(yaml.dump(data), `${base}.yaml`, "application/x-yaml");
        } else if (format === "csv") {
            triggerDownload(snippetsToCSV(data), `${base}.csv`, "text/csv");
        } else {
            triggerDownload(JSON.stringify(data, null, 2), `${base}.json`, "application/json");
        }
    };

    return (
        <div className="snippets-page">
            <PageHeader
                icon={activeTab === 0 ? mdiCodeBraces : mdiScriptText}
                title={activeTab === 0 ? t("snippets.page.title") : t("scripts.page.title")}
                subtitle={activeTab === 0 ? t("snippets.page.subtitle") : t("scripts.page.subtitle")}>
                {!isSourceSelected && activeTab === 0 && (
                    <>
                        <Button
                            text={t("snippets.import.button")}
                            icon={mdiFileImportOutline}
                            onClick={() => setSnippetImportDialogOpen(true)}
                            variant="secondary"
                        />
                        <Button
                            text={t("snippets.export.button")}
                            icon={mdiFileExportOutline}
                            onClick={handleExportClick}
                            variant="secondary"
                        />
                    </>
                )}
                {!isSourceSelected && (
                    <Button
                        text={activeTab === 0 ? t("snippets.page.addSnippet") : t("scripts.page.addScript")}
                        icon={mdiPlus}
                        onClick={handleCreateClick}
                    />
                )}
            </PageHeader>

            <div className="snippets-content-wrapper">
                <div className="snippets-controls">
                    <div className="snippets-tabs">
                        <TabSwitcher
                            tabs={[
                                { key: "snippets", label: t("snippets.page.tabs.snippets"), icon: mdiCodeBraces },
                                { key: "scripts", label: t("scripts.page.tabs.scripts"), icon: mdiScriptText }
                            ]}
                            activeTab={activeTab === 0 ? "snippets" : "scripts"}
                            onTabChange={(tabKey) => setActiveTab(tabKey === "snippets" ? 0 : 1)}
                        />
                    </div>

                    <div className="organization-selector">
                        <SelectBox
                            options={organizationOptions}
                            selected={currentSelection}
                            setSelected={handleSelectionChange}
                        />
                    </div>
                </div>

                <div className="snippets-content">
                    {activeTab === 0 && <SnippetsList snippets={snippets} onEdit={openEditSnippetDialog}
                                                      selectedOrganization={selectedOrganization}
                                                      isReadOnly={isSourceSelected} />}
                    {activeTab === 1 && <ScriptsList scripts={displayScripts} onEdit={openEditScriptDialog}
                                                     selectedOrganization={selectedOrganization}
                                                     isReadOnly={isSourceSelected} />}
                </div>
            </div>

            <SnippetDialog open={snippetDialogOpen} onClose={closeSnippetDialog} editSnippetId={editSnippetId}
                           selectedOrganization={selectedOrganization} />
            <SnippetImportDialog open={snippetImportDialogOpen}
                                 onClose={() => setSnippetImportDialogOpen(false)}
                                 organizationId={selectedOrganization} />
            <ScriptDialog open={scriptDialogOpen} onClose={closeScriptDialog} editScriptId={editScriptId}
                          selectedOrganization={selectedOrganization} />

            {exportMenuPos && (
                <div className="export-format-menu" style={{ top: exportMenuPos.top, left: exportMenuPos.left }}
                     onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => handleExportSnippets("json")}>JSON</button>
                    <button onClick={() => handleExportSnippets("yaml")}>YAML</button>
                    <button onClick={() => handleExportSnippets("csv")}>CSV</button>
                </div>
            )}
        </div>
    );
};