export const canReadDiagram = (db, user, diagramId) =>
    Boolean(
        db
            .prepare(
                `SELECT 1
                 FROM diagrams d
                 WHERE d.id = ?
                   AND d.archived_at IS NULL
                   AND (
                     ? = 'ADMIN'
                     OR EXISTS (
                       SELECT 1 FROM diagram_publishers p
                       WHERE p.diagram_id = d.id AND p.user_id = ?
                     )
                     OR EXISTS (
                       SELECT 1 FROM user_diagram_grants ug
                       WHERE ug.diagram_id = d.id AND ug.user_id = ?
                     )
                     OR EXISTS (
                       SELECT 1
                       FROM group_diagram_grants gg
                       JOIN user_groups membership ON membership.group_id = gg.group_id
                       WHERE gg.diagram_id = d.id AND membership.user_id = ?
                     )
                   )`
            )
            .get(diagramId, user.role, user.id, user.id, user.id)
    );

export const canPublishDiagram = (db, user, diagramId) =>
    Boolean(
        db
            .prepare(
                `SELECT 1
                 FROM diagrams d
                 WHERE d.id = ?
                   AND d.archived_at IS NULL
                   AND (
                     ? = 'ADMIN'
                     OR EXISTS (
                       SELECT 1 FROM diagram_publishers p
                       WHERE p.diagram_id = d.id AND p.user_id = ?
                     )
                   )`
            )
            .get(diagramId, user.role, user.id)
    );

export const requireRole =
    (...roles) =>
    async (request, reply) => {
        if (!request.user || !roles.includes(request.user.role)) {
            return reply.code(403).send({ error: 'Forbidden.' });
        }
    };
