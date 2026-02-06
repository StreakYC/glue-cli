import { useState } from "react";
import { Box, Text, useInput } from "ink";

export interface MultilineInputProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  initialValue?: string;
  focus?: boolean;
}

export function MultilineInput({
  onSubmit,
  placeholder = "Enter text...",
  initialValue = "",
  focus = true,
}: MultilineInputProps) {
  const [state, setState] = useState({
    lines: initialValue ? initialValue.split("\n") : [""],
    cursorLine: 0,
    cursorCol: 0,
  });

  useInput((input, key) => {
    if (!focus) return;

    if ((key.ctrl && input === "d") || key.escape) {
      onSubmit(state.lines.join("\n"));
      return;
    }

    if (key.return) {
      setState((prev) => {
        const currentLine = prev.lines[prev.cursorLine] || "";
        const beforeCursor = currentLine.slice(0, prev.cursorCol);
        const afterCursor = currentLine.slice(prev.cursorCol);
        const newLines = [...prev.lines];
        newLines[prev.cursorLine] = beforeCursor;
        newLines.splice(prev.cursorLine + 1, 0, afterCursor);
        return { lines: newLines, cursorLine: prev.cursorLine + 1, cursorCol: 0 };
      });
      return;
    }

    if (key.backspace || key.delete) {
      setState((prev) => {
        if (prev.cursorCol > 0) {
          const newLines = [...prev.lines];
          const currentLine = newLines[prev.cursorLine] || "";
          newLines[prev.cursorLine] = currentLine.slice(0, prev.cursorCol - 1) +
            currentLine.slice(prev.cursorCol);
          return { ...prev, lines: newLines, cursorCol: prev.cursorCol - 1 };
        } else if (prev.cursorLine > 0) {
          const prevLineLength = prev.lines[prev.cursorLine - 1]?.length || 0;
          const newLines = [...prev.lines];
          const currentLine = newLines[prev.cursorLine] || "";
          newLines[prev.cursorLine - 1] = (newLines[prev.cursorLine - 1] || "") + currentLine;
          newLines.splice(prev.cursorLine, 1);
          return { lines: newLines, cursorLine: prev.cursorLine - 1, cursorCol: prevLineLength };
        }
        return prev;
      });
      return;
    }

    if (key.upArrow) {
      setState((prev) => {
        if (prev.cursorLine > 0) {
          const newLine = prev.cursorLine - 1;
          return {
            ...prev,
            cursorLine: newLine,
            cursorCol: Math.min(prev.cursorCol, prev.lines[newLine]?.length || 0),
          };
        }
        return prev;
      });
      return;
    }

    if (key.downArrow) {
      setState((prev) => {
        if (prev.cursorLine < prev.lines.length - 1) {
          const newLine = prev.cursorLine + 1;
          return {
            ...prev,
            cursorLine: newLine,
            cursorCol: Math.min(prev.cursorCol, prev.lines[newLine]?.length || 0),
          };
        }
        return prev;
      });
      return;
    }

    if (key.leftArrow) {
      setState((prev) => {
        if (prev.cursorCol > 0) {
          return { ...prev, cursorCol: prev.cursorCol - 1 };
        } else if (prev.cursorLine > 0) {
          return {
            ...prev,
            cursorLine: prev.cursorLine - 1,
            cursorCol: prev.lines[prev.cursorLine - 1]?.length || 0,
          };
        }
        return prev;
      });
      return;
    }

    if (key.rightArrow) {
      setState((prev) => {
        const currentLineLength = prev.lines[prev.cursorLine]?.length || 0;
        if (prev.cursorCol < currentLineLength) {
          return { ...prev, cursorCol: prev.cursorCol + 1 };
        } else if (prev.cursorLine < prev.lines.length - 1) {
          return { ...prev, cursorLine: prev.cursorLine + 1, cursorCol: 0 };
        }
        return prev;
      });
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      setState((prev) => {
        const newLines = [...prev.lines];
        const currentLine = newLines[prev.cursorLine] || "";
        newLines[prev.cursorLine] = currentLine.slice(0, prev.cursorCol) + input +
          currentLine.slice(prev.cursorCol);
        return { ...prev, lines: newLines, cursorCol: prev.cursorCol + input.length };
      });
    }
  }, { isActive: focus });

  const { lines, cursorLine, cursorCol } = state;
  const isEmpty = lines.length === 1 && lines[0] === "";

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="blue" paddingX={1}>
      <Box marginBottom={1}>
        <Text color="gray" dimColor>
          {"(Enter: new line, Ctrl+D/Esc: submit)"}
        </Text>
      </Box>
      {isEmpty ? <Text color="gray">{placeholder}</Text> : (
        lines.map((line, lineIndex) => (
          <Box key={lineIndex}>
            <Text color="gray" dimColor>
              {String(lineIndex + 1).padStart(2, " ")} │{" "}
            </Text>
            {lineIndex === cursorLine
              ? (
                <Text>
                  {line.slice(0, cursorCol)}
                  <Text backgroundColor="white" color="black">
                    {line[cursorCol] || " "}
                  </Text>
                  {line.slice(cursorCol + 1)}
                </Text>
              )
              : <Text>{line}</Text>}
          </Box>
        ))
      )}
    </Box>
  );
}
