import { isDatabaseMetadata } from './metadata-types/database-metadata';

const applyCommonFixups = (json: string): string => {
    return (
        json
            .replace(/\r/g, '') // Strip carriage returns (invalid control char in JSON strings)
            .replace(/\n/g, '')
            // Strip terminal-output decoration characters (e.g. ClickHouse client's
            // ↴│↳ arrows and box-drawing chars that get included in copy-paste).
            .replace(/[\u2190-\u21FF\u2500-\u257F]/g, '')
            .replace(/,(\s*[\]}])/g, '$1') // Remove trailing commas (common JS-to-JSON mistake)
            .replace(/(\[)\s*,/g, '$1') // Remove leading commas in arrays (from NULL IFNULL templates)
            .replace(/"precision": "null"/g, '"precision": null')
            .replace(/"nullable": "false"/g, '"nullable": false')
            .replace(/"nullable": "true"/g, '"nullable": true')
    );
};

// Extract inner JSON from query-result wrappers. File exports contain a JSON
// string; some pasted results omit escaping and need brace counting instead.
const extractMetadataWrapper = (payload: string): string | null => {
    const wrapperKey = 'metadata_json_to_import';

    try {
        const parsed = JSON.parse(payload);
        const wrapper = Array.isArray(parsed) ? parsed[0] : parsed;

        if (wrapper && typeof wrapper === 'object') {
            const key = Object.keys(wrapper).find(
                (candidate) => candidate.toLowerCase() === wrapperKey
            );
            const value = key ? wrapper[key] : null;

            if (typeof value === 'string') return value;
        }
    } catch {
        // Some clients emit an invalid wrapper with unescaped inner JSON.
    }

    const normalizedPayload = payload.toLowerCase();
    if (!normalizedPayload.includes(wrapperKey)) return null;

    const keyIdx = normalizedPayload.indexOf(wrapperKey);
    const startIdx = payload.indexOf('{', keyIdx + wrapperKey.length);
    if (startIdx === -1) return null;

    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = startIdx; i < payload.length; i++) {
        const ch = payload[i];
        if (escape) {
            escape = false;
            continue;
        }
        if (ch === '\\') {
            escape = true;
            continue;
        }
        if (ch === '"') inString = !inString;
        if (inString) continue;
        if (ch === '{') depth++;
        else if (ch === '}') {
            depth--;
            if (depth === 0) return payload.slice(startIdx, i + 1);
        }
    }
    return null;
};

export const fixMetadataJson = (metadataJson: string): string => {
    // Replace problematic array default values with null
    metadataJson = metadataJson.replace(
        /"default": "?'?\[[^\]]*\]'?"?(\\")?(,|\})/gs,
        '"default": null$2'
    );

    // Generic fix for all default values with '\ pattern - convert to just '
    metadataJson = metadataJson.replace(
        /"default":\s*"(.*?)'\\"(,|\})/g,
        '"default": "$1"$2'
    );

    const innerJson = extractMetadataWrapper(metadataJson);
    if (innerJson) {
        const innerCleaned = applyCommonFixups(innerJson);
        try {
            JSON.parse(innerCleaned);
            return innerCleaned;
        } catch {
            // Inner JSON also broken, fall through
        }
    }

    // Try minimal cleanup first — this preserves valid JSON escaping (e.g. \" in
    // string values like Snowflake clustering keys with quoted identifiers).
    // The destructive \" → " replacement below would break these.
    const minimalCleaned = applyCommonFixups(
        metadataJson
            .trim()
            .replace(/^[^{]*/, '')
            .replace(/}[^}]*$/, '}')
    );

    try {
        JSON.parse(minimalCleaned);
        return minimalCleaned;
    } catch {
        // Not valid JSON as-is, try other formats below
    }

    // Try CSV unwrap — Snowflake Snowsight CSV exports wrap the JSON in quotes
    // and escape all internal " as "". Unwrapping "" → " produces valid JSON
    // while preserving legitimate \" escaping (e.g. clustering keys).
    const csvUnwrapped = applyCommonFixups(
        metadataJson
            .trim()
            .replace(/^[^{]*/, '')
            .replace(/}[^}]*$/, '}')
            .replace(/""/g, '"')
    );

    try {
        JSON.parse(csvUnwrapped);
        return csvUnwrapped;
    } catch {
        // Not CSV format, try wrapper extraction
    }

    return applyCommonFixups(
        metadataJson
            .trim()
            // First unescape the JSON string
            .replace(/\\n/g, '') // Remove literal \n (backslash + n) from stringified JSON
            .replace(/\\t/g, '') // Remove literal \t (backslash + t) from stringified JSON
            .replace(/\\r/g, '') // Remove literal \r (backslash + r) from stringified JSON
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\')
            .replace(/^[^{]*/, '') // Remove everything before the first '{'
            .replace(/}[^}]*$/, '}') // Remove everything after the last '}'
            .replace(/: ""([^"]*)""/g, ': "$1"') // Convert : ""value"" to : "value" (handles values with any content)
            .replace(/:""([^"]*)""/g, ':"$1"') // Convert :""value"" to :"value" (no space variant)
            .replace(/""(\w+)""/g, '"$1"') // Convert ""key"" to "key"
            .replace(/^\s+|\s+$/g, '')
            .replace(/^"|"$/g, '')
            .replace(/^'|'$/g, '')
            .replace(/""""/g, '""') // Remove Quadruple quotes from keys
            .replace(/"""([^",}]+)"""/g, '"$1"') // Remove tripple quotes from keys
            .replace(/""([^",}]+)""/g, '"$1"') // Remove double quotes from keys

            .replace(/'"([^"]+)"'/g, '\\"$1\\"') // Replace single-quoted double quotes
            .replace(/'(".*?")'/g, "'\\$1'") // Handle cases like '"{}"'::json

            // Handle specific case for nextval with quoted identifiers
            .replace(
                /nextval\('(".*?")'::regclass\)/g,
                "nextval('\\$1'::regclass)"
            )

            // Handle cases like "'CHAT'::"CustomType"" (ensures existing quotes are escaped for JSON)
            /* eslint-disable-next-line no-useless-escape */
            .replace(/'([^']+)'::\"([^\"]+)\"/g, '\'$1\'::\\\"$2\\\"')

            /* eslint-disable-next-line no-useless-escape */
            .replace(/\"/g, '___ESCAPED_QUOTE___') // Temporarily replace empty strings
            .replace(/(:\s*)""(?=\s*[,}])/g, '$1___EMPTY___') // Temporarily replace empty strings (Safari-compatible)
            .replace(/""/g, '"') // Replace remaining double quotes
            .replace(/___ESCAPED_QUOTE___/g, '"') // Restore empty strings
            .replace(/___EMPTY___/g, '""') // Restore empty strings
    );
};

export const isStringMetadataJson = (metadataJsonString: string): boolean => {
    let result = false;
    try {
        const parsedResult = JSON.parse(metadataJsonString);

        result = isDatabaseMetadata(parsedResult);
    } catch {
        result = false;
    }

    return result;
};

export const minimizeQuery = (query: string) => {
    if (!query) return '';

    // Split into lines, trim leading spaces from each line, then rejoin
    return query
        .split('\n')
        .map((line) => line.replace(/^\s+/, '')) // Remove only leading spaces
        .join('\n');
};
