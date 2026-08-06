export const canAddPublisher = (db, id) =>
    Boolean(
        db
            .prepare(
                "SELECT 1 FROM users WHERE id = ? AND role = 'PUBLISHER' AND active = 1"
            )
            .get(id)
    );

export const canAddDirectViewer = (db, id) =>
    Boolean(
        db
            .prepare(
                "SELECT 1 FROM users WHERE id = ? AND role <> 'ADMIN' AND active = 1"
            )
            .get(id)
    );

export const canAddGroupMember = (db, id) =>
    Boolean(
        db.prepare('SELECT 1 FROM users WHERE id = ? AND active = 1').get(id)
    );

export const groupExists = (db, id) =>
    Boolean(db.prepare('SELECT 1 FROM groups WHERE id = ?').get(id));
