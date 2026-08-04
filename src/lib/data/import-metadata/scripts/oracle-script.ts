export const oracleDBQuery = `----------------------------------------------------------------------------
-- 1.  FOREIGN-KEY METADATA
----------------------------------------------------------------------------
-- ponytail: USER_* assumes the login schema is the import target; restore
-- ALL_* owner filters if proxy-user or ALTER SESSION imports are required.
WITH fk_info AS (
	SELECT JSON_OBJECT(
	       KEY 'schema'            VALUE SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
	       KEY 'table'             VALUE a.table_name,
	       KEY 'column'            VALUE b.column_name,
	       KEY 'foreign_key_name'  VALUE a.constraint_name,
	       KEY 'reference_schema'  VALUE c.owner,
	       KEY 'reference_table'   VALUE c.table_name,
	       KEY 'reference_column'  VALUE d.column_name,
	       KEY 'fk_def'            VALUE
	            'FOREIGN KEY ('||b.column_name||') REFERENCES '||
	            c.table_name||'('||d.column_name||') ON DELETE '||
	            DECODE(a.delete_rule,
	                   'CASCADE' , 'CASCADE' ,
	                   'SET NULL', 'SET NULL',
	                   'RESTRICT', 'RESTRICT',
	                   'NO ACTION')
	       RETURNING CLOB
	     ) AS json_data
	FROM   user_constraints    a
	JOIN   user_cons_columns   b
	     ON  b.constraint_name = a.constraint_name
	JOIN   all_constraints     c
	     ON  c.owner = a.r_owner
	    AND c.constraint_name = a.r_constraint_name
	JOIN   all_cons_columns    d
	     ON  d.owner = c.owner
	    AND d.constraint_name = c.constraint_name
	    AND d.position        = b.position
	WHERE  a.constraint_type = 'R'
	),

	/* ==============================================================
	2.  PRIMARY-KEY METADATA
	==============================================================*/
	pk_info AS (
	SELECT JSON_OBJECT(
	       KEY 'schema' VALUE SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
	       KEY 'table'  VALUE a.table_name,
	       KEY 'column' VALUE LISTAGG(b.column_name, ', ')
	                        WITHIN GROUP (ORDER BY b.position),
	       KEY 'pk_def' VALUE 'PRIMARY KEY ('||
	                         LISTAGG(b.column_name, ', ')
	                           WITHIN GROUP (ORDER BY b.position)||')'
	       RETURNING CLOB
	     ) AS json_data
	FROM   user_constraints  a
	JOIN   user_cons_columns b
	     ON b.constraint_name = a.constraint_name
	WHERE  a.constraint_type = 'P'
	GROUP  BY a.table_name
	),

	/* ==============================================================
	3.  COLUMN METADATA
	==============================================================*/
	cols AS (
	SELECT JSON_OBJECT(
	       KEY 'schema'                   VALUE SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
	       KEY 'table'                    VALUE col.table_name,
	       KEY 'name'                     VALUE col.column_name,
	       KEY 'type'                     VALUE LOWER(col.data_type),
	       KEY 'character_maximum_length' VALUE CASE
	                                              WHEN col.data_type LIKE '%CHAR%'
	                                              THEN TO_CHAR(col.char_length)
	                                            END,
	       KEY 'precision'                VALUE CASE
	                                              WHEN col.data_type IN ('NUMBER','FLOAT','DECIMAL')
	                                              THEN JSON_OBJECT(
	                                                     KEY 'precision' VALUE col.data_precision,
	                                                     KEY 'scale'     VALUE col.data_scale)
	                                            END,
	       KEY 'ordinal_position'         VALUE col.column_id,
	       KEY 'nullable'                 VALUE CASE col.nullable
	                                            WHEN 'Y' THEN 'true' ELSE 'false' END FORMAT JSON,
	       KEY 'default'                  VALUE '""' FORMAT JSON,
	       KEY 'collation'                VALUE '""' FORMAT JSON,
	       KEY 'comment'                  VALUE ccm.comments
	       RETURNING CLOB
	     ) AS json_data
	FROM   user_tab_columns col
	LEFT JOIN user_col_comments ccm
	     ON  ccm.table_name  = col.table_name
	    AND ccm.column_name = col.column_name
	),

	/* ==============================================================
	4.  INDEX METADATA
	==============================================================*/
	indexes AS (
	SELECT JSON_OBJECT(
	         KEY 'schema'          VALUE SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
	         KEY 'table'           VALUE i.table_name,
	         KEY 'name'            VALUE i.index_name,
	         KEY 'size'            VALUE -1,
	         KEY 'column'          VALUE c.column_name,
	         KEY 'index_type'      VALUE LOWER(i.index_type),
	         KEY 'cardinality'     VALUE 0,
	         KEY 'direction'       VALUE CASE c.descend WHEN 'DESC' THEN 'desc' ELSE 'asc' END,
	         KEY 'column_position' VALUE c.column_position,
	         /* boolean → use FORMAT JSON so true/false are not quoted */
	         KEY 'unique'          VALUE CASE i.uniqueness WHEN 'UNIQUE' THEN 'true' ELSE 'false' END FORMAT JSON
	         RETURNING CLOB
	       ) AS json_data
	FROM   user_indexes      i
	JOIN   user_ind_columns  c
	       ON  c.index_name = i.index_name
	      AND c.table_name = i.table_name
	),

	/* ==============================================================
	5.  TABLE & VIEW METADATA
	==============================================================*/
	tbls AS (
	SELECT JSON_OBJECT(
	       KEY 'schema'    VALUE SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
	       KEY 'table'     VALUE t.table_name,
	       KEY 'rows'      VALUE NVL(t.num_rows, 0),
	       KEY 'type'      VALUE 'TABLE',
	       KEY 'engine'    VALUE '""' FORMAT JSON,
	       KEY 'collation' VALUE '""' FORMAT JSON,
	       KEY 'comment'   VALUE tcm.comments
	       RETURNING CLOB
	     ) AS json_data
	FROM   user_tables t
	LEFT JOIN user_tab_comments tcm
	     ON tcm.table_name = t.table_name
	),
	views AS (
	SELECT JSON_OBJECT(
	         KEY 'schema'          VALUE SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
	         KEY 'view_name'       VALUE v.view_name,
	         /* JSON literal for empty string */
	         KEY 'view_definition' VALUE '""' FORMAT JSON
	         RETURNING CLOB
	       ) AS json_data
	FROM   user_views v
	)

	/* ==============================================================
	6.  COMPOSE THE FINAL JSON DOCUMENT
	==============================================================*/
	SELECT JSON_OBJECT(
	     KEY 'fk_info'       VALUE NVL((SELECT JSON_ARRAYAGG(json_data RETURNING CLOB) FROM fk_info), TO_CLOB('[]')) FORMAT JSON,
	     KEY 'pk_info'       VALUE NVL((SELECT JSON_ARRAYAGG(json_data RETURNING CLOB) FROM pk_info), TO_CLOB('[]')) FORMAT JSON,
	     KEY 'columns'       VALUE NVL((SELECT JSON_ARRAYAGG(json_data RETURNING CLOB) FROM cols), TO_CLOB('[]')) FORMAT JSON,
	     KEY 'indexes'       VALUE NVL((SELECT JSON_ARRAYAGG(json_data RETURNING CLOB) FROM indexes), TO_CLOB('[]')) FORMAT JSON,
	     KEY 'tables'        VALUE NVL((SELECT JSON_ARRAYAGG(json_data RETURNING CLOB) FROM tbls), TO_CLOB('[]')) FORMAT JSON,
	     KEY 'views'         VALUE NVL((SELECT JSON_ARRAYAGG(json_data RETURNING CLOB) FROM views), TO_CLOB('[]')) FORMAT JSON,
	     KEY 'schema'        VALUE SYS_CONTEXT('USERENV','CURRENT_SCHEMA'),
	     KEY 'database_name' VALUE SYS_CONTEXT('USERENV','DB_NAME'),
	     KEY 'version' 		 VALUE SYS_CONTEXT('USERENV','DB_NAME')
	     RETURNING CLOB
	   ) AS metadata_json_to_import
	FROM   dual
`;
