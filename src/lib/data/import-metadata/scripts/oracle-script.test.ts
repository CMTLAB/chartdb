import { describe, expect, it } from 'vitest';
import { oracleDBQuery } from './oracle-script';

describe('oracleDBQuery', () => {
    it('uses current-schema dictionary views and joins comments once', () => {
        expect(oracleDBQuery).toContain('FROM   user_tab_columns col');
        expect(oracleDBQuery).toContain('LEFT JOIN user_col_comments ccm');
        expect(oracleDBQuery).toContain('FROM   user_tables t');
        expect(oracleDBQuery).toContain('LEFT JOIN user_tab_comments tcm');
        expect(oracleDBQuery).not.toContain('FROM   all_tab_columns');
        expect(oracleDBQuery).not.toContain('FROM   all_tables');
    });

    it('keeps cross-schema dictionary views for referenced foreign keys', () => {
        expect(oracleDBQuery).toContain('JOIN   all_constraints     c');
        expect(oracleDBQuery).toContain('JOIN   all_cons_columns    d');
    });
});
