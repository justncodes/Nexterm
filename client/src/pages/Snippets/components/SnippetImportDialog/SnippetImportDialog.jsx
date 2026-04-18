import { DialogProvider } from "@/common/components/Dialog";
import "./styles.sass";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SnippetContext } from "@/common/contexts/SnippetContext.jsx";
import { mdiFileDocumentOutline, mdiFileUploadOutline } from "@mdi/js";
import Button from "@/common/components/Button";
import { postRequest } from "@/common/utils/RequestUtil.js";
import { useToast } from "@/common/contexts/ToastContext.jsx";
import { parseByFormat } from "./parsers.js";

const FORMAT_OPTIONS = ["auto", "json", "yaml", "csv"];
const STRATEGY_OPTIONS = ["skip", "overwrite", "create"];
const MAX_FILE_SIZE = 5 * 1024 * 1024;

export const SnippetImportDialog = ({ open, onClose, organizationId }) => {
    const { t } = useTranslation();
    const [content, setContent] = useState("");
    const [format, setFormat] = useState("auto");
    const [strategy, setStrategy] = useState("skip");
    const [filename, setFilename] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [lastResult, setLastResult] = useState(null);
    const [showDetails, setShowDetails] = useState(false);
    const fileInputRef = useRef(null);

    const { loadAllSnippets } = useContext(SnippetContext);
    const { sendToast } = useToast();

    const parseResult = useMemo(() => {
        if (!content.trim()) return { snippets: [], errors: [] };
        return parseByFormat(content, format, filename);
    }, [content, format, filename]);

    const resetForm = () => {
        setContent("");
        setFilename(null);
        setFormat("auto");
        setStrategy("skip");
        setLastResult(null);
        setShowDetails(false);
    };

    useEffect(() => { if (!open) resetForm(); }, [open]);

    const handleFilePick = () => fileInputRef.current?.click();

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        e.target.value = "";
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
                setLastResult(result);
                await loadAllSnippets();
                sendToast("Success", result.message);
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

                <div className="form-row">
                    <div className="form-group">
                        <label htmlFor="snippet-import-format">{t("snippets.import.formatLabel")}</label>
                        <select
                            id="snippet-import-format"
                            value={format}
                            onChange={(e) => setFormat(e.target.value)}>
                            {FORMAT_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{t(`snippets.import.format.${opt}`)}</option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group file-picker-group">
                        <label>{t("snippets.import.fileLabel")}</label>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,.yaml,.yml,.csv,.txt"
                            onChange={handleFileChange}
                            style={{ display: "none" }}
                        />
                        <Button
                            text={filename || t("snippets.import.filePicker")}
                            icon={mdiFileUploadOutline}
                            onClick={handleFilePick}
                            variant="secondary"
                        />
                    </div>
                </div>

                <div className="form-group">
                    <label htmlFor="snippet-import-content">{t("snippets.import.pasteLabel")}</label>
                    <textarea
                        id="snippet-import-content"
                        placeholder={t("snippets.import.placeholder")}
                        value={content}
                        onChange={(e) => { setContent(e.target.value); setFilename(null); }}
                        rows={10}
                    />
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
                </div>

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
                                <div className="strategy-text">
                                    <span className="strategy-title">{t(`snippets.import.duplicate.${opt}`)}</span>
                                    <span className="strategy-hint">{t(`snippets.import.duplicate.${opt}Hint`)}</span>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>

                {lastResult && (
                    <div className="import-result">
                        <div className="result-counts">
                            <span className="count-imported">{t("snippets.import.result.imported", { count: lastResult.imported })}</span>
                            <span className="count-updated">{t("snippets.import.result.updated", { count: lastResult.updated })}</span>
                            <span className="count-skipped">{t("snippets.import.result.skipped", { count: lastResult.skipped })}</span>
                            {lastResult.errors > 0 && (
                                <span className="count-errors">{t("snippets.import.result.errors", { count: lastResult.errors })}</span>
                            )}
                        </div>
                        <button type="button" className="toggle-details" onClick={() => setShowDetails(v => !v)}>
                            {showDetails ? t("snippets.import.result.hideDetails") : t("snippets.import.result.viewDetails")}
                        </button>
                        {showDetails && (
                            <ul className="result-details">
                                {lastResult.details.map((d, i) => (
                                    <li key={i} className={`detail-${d.status}`}>
                                        <strong>{d.name}</strong> — {t(`snippets.import.result.status.${d.status}`)}
                                        {d.reason && <span className="detail-reason"> ({d.reason})</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}

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
