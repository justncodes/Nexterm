const Snippet = require("../models/Snippet");
const { Op } = require("sequelize");
const stateBroadcaster = require("../lib/StateBroadcaster");

const getWhereClause = (id, accountId, organizationId) => organizationId
    ? { id, organizationId }
    : { id, accountId, organizationId: null };

const getScopeWhere = (accountId, organizationId) => organizationId
    ? { organizationId, sourceId: null }
    : { accountId, organizationId: null, sourceId: null };

module.exports.createSnippet = async (accountId, configuration) => {
    const maxSortOrder = await Snippet.max('sortOrder', {
        where: getScopeWhere(accountId, configuration.organizationId)
    }) || 0;
    const snippet = await Snippet.create({ 
        ...configuration, 
        accountId: configuration.organizationId ? null : accountId,
        sortOrder: maxSortOrder + 1 
    });

    stateBroadcaster.broadcast("SNIPPETS", { accountId, organizationId: configuration.organizationId });

    return snippet;
};

module.exports.deleteSnippet = async (accountId, snippetId, organizationId = null) => {
    const snippet = await Snippet.findOne({ where: getWhereClause(snippetId, accountId, organizationId) });
    if (!snippet) return { code: 404, message: "Snippet does not exist" };
    if (snippet.sourceId) return { code: 403, message: "Cannot delete source-synced snippets" };
    await Snippet.destroy({ where: { id: snippetId } });

    stateBroadcaster.broadcast("SNIPPETS", { accountId, organizationId: snippet.organizationId });
};

module.exports.editSnippet = async (accountId, snippetId, configuration, organizationId = null) => {
    const snippet = await Snippet.findOne({ where: getWhereClause(snippetId, accountId, organizationId) });
    if (!snippet) return { code: 404, message: "Snippet does not exist" };
    if (snippet.sourceId) return { code: 403, message: "Cannot edit source-synced snippets" };
    const { organizationId: _, accountId: __, ...updateData } = configuration;
    await Snippet.update(updateData, { where: { id: snippetId } });

    stateBroadcaster.broadcast("SNIPPETS", { accountId, organizationId: snippet.organizationId });
};

module.exports.repositionSnippet = async (accountId, snippetId, { targetId }, organizationId = null) => {
    if (!targetId || parseInt(snippetId) === parseInt(targetId)) return { success: true };
    
    const snippet = await Snippet.findOne({ where: getWhereClause(snippetId, accountId, organizationId) });
    if (!snippet) return { code: 404, message: "Snippet does not exist" };
    if (snippet.sourceId) return { code: 403, message: "Cannot reorder source-synced snippets" };
    
    const all = await Snippet.findAll({ where: getScopeWhere(accountId, organizationId), order: [['sortOrder', 'ASC'], ['id', 'ASC']] });
    
    const srcIdx = all.findIndex(s => s.id === parseInt(snippetId));
    const tgtIdx = all.findIndex(s => s.id === parseInt(targetId));
    if (srcIdx === -1 || tgtIdx === -1) return { code: 404, message: "Snippet not found" };
    
    all.splice(tgtIdx, 0, all.splice(srcIdx, 1)[0]);
    await Promise.all(all.map((s, i) => Snippet.update({ sortOrder: i + 1 }, { where: { id: s.id } })));

    stateBroadcaster.broadcast("SNIPPETS", { accountId, organizationId: snippet.organizationId });

    return { success: true };
};

module.exports.getSnippet = async (accountId, snippetId, organizationId = null) => {
    const snippet = await Snippet.findOne({ where: getWhereClause(snippetId, accountId, organizationId) });
    return snippet || { code: 404, message: "Snippet does not exist" };
};

module.exports.listSnippets = async (accountId, organizationId = null) => {
    return Snippet.findAll({ where: getScopeWhere(accountId, organizationId), order: [["sortOrder", "ASC"]] });
};

module.exports.listAllAccessibleSnippets = async (accountId, organizationIds = []) => {
    return Snippet.findAll({ 
        where: {
            [Op.or]: [
                { accountId, organizationId: null, sourceId: null },
                ...(organizationIds.length > 0 ? [{ organizationId: { [Op.in]: organizationIds } }] : [])
            ]
        },
        order: [["sortOrder", "ASC"]]
    });
};

module.exports.listSourceSnippets = async (sourceId) =>
    Snippet.findAll({ where: { sourceId }, order: [["sortOrder", "ASC"]] });

module.exports.listAllSourceSnippets = async () =>
    Snippet.findAll({ where: { sourceId: { [Op.ne]: null } }, order: [["sortOrder", "ASC"]] });

module.exports.importSnippets = async (accountId, { snippets, organizationId, duplicateStrategy }) => {
    const scopeWhere = getScopeWhere(accountId, organizationId);
    const results = { imported: 0, updated: 0, skipped: 0, errors: 0, details: [] };
    let nextSortOrder = (await Snippet.max('sortOrder', { where: scopeWhere }) || 0) + 1;

    const existingByName = new Map(
        (await Snippet.findAll({
            where: { ...scopeWhere, name: { [Op.in]: snippets.map(s => s.name) } },
            attributes: ['id', 'name'],
        })).map(row => [row.name, row])
    );

    for (const incoming of snippets) {
        try {
            const existing = existingByName.get(incoming.name);

            if (existing && duplicateStrategy === "skip") {
                results.skipped++;
                results.details.push({ name: incoming.name, status: 'skipped', reason: 'Snippet exists' });
                continue;
            }

            if (existing && duplicateStrategy === "overwrite") {
                await Snippet.update({
                    command: incoming.command,
                    description: incoming.description ?? null,
                    osFilter: incoming.osFilter ?? null,
                }, { where: { id: existing.id } });
                results.updated++;
                results.details.push({ name: incoming.name, status: 'updated', snippetId: existing.id });
                continue;
            }

            const snippet = await Snippet.create({
                name: incoming.name,
                command: incoming.command,
                description: incoming.description ?? null,
                osFilter: incoming.osFilter ?? null,
                accountId: organizationId ? null : accountId,
                organizationId: organizationId || null,
                sortOrder: nextSortOrder++,
            });

            results.imported++;
            results.details.push({ name: incoming.name, status: 'imported', snippetId: snippet.id });
        } catch (error) {
            results.errors++;
            results.details.push({ name: incoming.name, status: 'error', reason: error.message });
        }
    }

    if (results.imported > 0 || results.updated > 0) {
        stateBroadcaster.broadcast("SNIPPETS", { accountId, organizationId: organizationId || null });
    }

    return {
        message: `Snippet import: ${results.imported} imported, ${results.updated} updated, ${results.skipped} skipped, ${results.errors} errors`,
        ...results
    };
};

module.exports.exportSnippets = async (accountId, organizationId = null) => {
    return Snippet.findAll({
        where: getScopeWhere(accountId, organizationId),
        attributes: ['name', 'command', 'description', 'osFilter'],
        order: [["sortOrder", "ASC"]],
        raw: true,
    });
};
