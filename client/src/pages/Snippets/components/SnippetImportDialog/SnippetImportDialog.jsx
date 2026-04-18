import { DialogProvider } from "@/common/components/Dialog";
import "./styles.sass";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SnippetContext } from "@/common/contexts/SnippetContext.jsx";
import { mdiFileDocumentOutline, mdiFileUploadOutline } from "@mdi/js";
import Icon from "@mdi/react";
import Button from "@/common/components/Button";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import { Tooltip } from "@/common/components/Tooltip/Tooltip.jsx";
import { autoParse } from "./parsers.js";

const STRATEGY_OPTIONS = ["skip", "overwrite", "create"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ".json,.yaml,.yml,.csv,.txt";

export const SnippetImportDialog = ({ open, onClose, organizationId }) => {
    const { t } = useTranslation();
    const [content, setContent] = useState("");
    const [strategy, setStrategy] = useState("skip");
    const [filename, setFilename] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const fileInputRef = useRef(null);
    const dragCounter = useRef(0);

    const { loadAllSnippets } = useContext(SnippetContext);
    const { sendToast } = useToast();

    const parseResult = useMemo(() => {
        if (!content.trim()) return { snippets: [], errors: [] };
        return autoParse(content, filename);
    }, [content, filename]);

    const resetForm = () => {
        setContent("");
        setFilename(null);
        setStrategy("skip");
        setIsDragging(false);
        dragCounter.current = 0;
    };

    useEffect(() => { if (!open) resetForm(); }, [open]);

    const handleFilePick = () => fileInputRef.current?.click();

    const loadFile = (file) => {
        if (!file) return;
        if (file.size > MAX_FILE_SIZE) {
            sendToast("Error", t("snippets.import.messages.fileTooLarge"));
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => {
            setContent(String(ev.target?.result || ""));
            setFilename(file.name);
        };
        reader.readAsText(file);
    };

    const handleFileChange = (e) => {
        loadFile(e.target.files?.[0]);
        e.target.value = "";
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current++;
        if (dragCounter.current === 1) setIsDragging(true);
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current--;
        if (dragCounter.current === 0) setIsDragging(false);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(false);
        dragCounter.current = 0;
        loadFile(e.dataTransfer.files?.[0]);
    };

    const submit = async () => {
        if (parseResult.snippets.length === 0) return;
        setIsImporting(true);
        try {
            const result = await postRequest("snippets/import", {
                snippets: parseResult.snippets,
                organizationId: organizationId || null,
                duplicateStrategy: strategy,
            });

            if (result?.code) {
                sendToast("Error", result.message);
            } else {
                await loadAllSnippets();
                let msg = `Imported ${result.imported} snippet${result.imported !== 1 ? "s" : ""}`;
                if (result.updated) msg += `, updated ${result.updated}`;
                if (result.skipped) msg += `, skipped ${result.skipped}`;
                if (result.errors) msg += `, ${result.errors} error${result.errors !== 1 ? "s" : ""}`;
                sendToast("Success", msg);
                onClose();
            }
        } catch (error) {
            console.error("Snippet import failed", error);
            sendToast("Error", t("snippets.import.messages.importFailed"));
        } finally {
            setIsImporting(false);
        }
    };

    const parsedCount = parseResult.snippets.length;
    const parseErrorCount = parseResult.errors.length;
    const canImport = !isImporting && parsedCount > 0;

    return (
        <DialogProvider open={open} onClose={onClose}>
            <div className="snippet-import-dialog">
                <h2>{t("snippets.import.title")}</h2>

                <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_EXTENSIONS}
                    onChange={handleFileChange}
                    style={{ display: "none" }}
                />

                <div
                    className={`drop-zone ${isDragging ? "dragging" : ""} ${filename ? "has-file" : ""}`}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={!filename ? handleFilePick : undefined}
                >
                    {filename ? (
                        <div className="drop-zone-loaded">
                            <Icon path={mdiFileDocumentOutline} size={1.2} />
                            <span className="drop-zone-filename">{filename}</span>
                            <button type="button" className="drop-zone-clear" onClick={(e) => {
                                e.stopPropagation();
                                setContent("");
                                setFilename(null);
                            }}>&times;</button>
                        </div>
                    ) : (
                        <div className="drop-zone-empty">
                            <Icon path={mdiFileUploadOutline} size={1.5} />
                            <span>{t("snippets.import.dropZone")}</span>
                            <span className="drop-zone-hint">{t("snippets.import.dropZoneHint")}</span>
                        </div>
                    )}
                </div>

                {content.trim() && (
                    <div className={`parse-status ${parseErrorCount > 0 ? "has-errors" : ""}`}>
                        {t("snippets.import.parsedCount", { count: parsedCount, errors: parseErrorCount })}
                        {parseErrorCount > 0 && (
                            <ul className="parse-errors">
                                {parseResult.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                            </ul>
                        )}
                    </div>
                )}

                <div className="form-group">
                    <label>{t("snippets.import.duplicate.label")}</label>
                    <div className="strategy-options">
                        {STRATEGY_OPTIONS.map(opt => (
                            <label key={opt} className="strategy-option">
                                <input
                                    type="radio"
                                    name="duplicateStrategy"
                                    value={opt}
                                    checked={strategy === opt}
                                    onChange={() => setStrategy(opt)}
                                />
                                <span className="strategy-title">{t(`snippets.import.duplicate.${opt}`)}</span>
                                <Tooltip text={t(`snippets.import.duplicate.${opt}Hint`)}>
                                    <span className="strategy-hint-icon">?</span>
                                </Tooltip>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="dialog-actions">
                    <Button
                        text={t("snippets.import.actions.close")}
                        onClick={onClose}
                        variant="secondary"
                    />
                    <Button
                        text={isImporting ? t("snippets.import.actions.importing") : t("snippets.import.actions.import")}
                        onClick={submit}
                        icon={mdiFileDocumentOutline}
                        disabled={!canImport}
                    />
                </div>
            </div>
        </DialogProvider>
    );
};
