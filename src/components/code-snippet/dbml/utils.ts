import type { DBMLError } from '@/lib/dbml/dbml-import/dbml-import-error';
import { editor, Range } from 'monaco-editor/esm/vs/editor/editor.api.js';

export const highlightErrorLine = ({
    error,
    model,
    editorDecorationsCollection,
}: {
    error: DBMLError;
    model?: editor.ITextModel | null;
    editorDecorationsCollection:
        | editor.IEditorDecorationsCollection
        | undefined;
}) => {
    if (!model) return;
    if (!editorDecorationsCollection) return;

    const decorations = [
        {
            range: new Range(
                error.line,
                1,
                error.line,
                model.getLineMaxColumn(error.line)
            ),
            options: {
                isWholeLine: true,
                className: 'dbml-error-line',
                glyphMarginClassName: 'dbml-error-glyph',
                hoverMessage: { value: error.message },
                overviewRuler: {
                    color: '#ff0000',
                    position: editor.OverviewRulerLane.Right,
                    darkColor: '#ff0000',
                },
            },
        },
    ];

    editorDecorationsCollection?.set(decorations);
};

export const clearErrorHighlight = (
    editorDecorationsCollection: editor.IEditorDecorationsCollection | undefined
) => {
    if (editorDecorationsCollection) {
        editorDecorationsCollection.clear();
    }
};
