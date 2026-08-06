import { randomUUID } from 'node:crypto';

export const appendAudit = (
    db,
    { actorUserId, action, targetType, targetId, detail, at }
) =>
    db
        .prepare(
            `INSERT INTO audit_log(
                id, at, actor_user_id, action, target_type, target_id, detail_json
             ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            randomUUID(),
            at ?? new Date().toISOString(),
            actorUserId,
            action,
            targetType,
            targetId,
            JSON.stringify(detail)
        );
