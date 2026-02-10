import { useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import chalk from "chalk";

export interface MultilineInputProps {
  onSubmit: (value: string) => void;
  initialValue?: string;
  /**
   * When disabled, user input is ignored.
   *
   * @default false
   */
  isDisabled?: boolean;
}

export function MultilineInput({
  onSubmit,
  initialValue = "",
  isDisabled = false,
}: MultilineInputProps) {
  const [state, setState] = useState({
    lines: initialValue ? initialValue.split("\n") : [""],
    cursorLine: 0,
    cursorCol: 0,
    submitting: false,
  });

  // Handle submission in an effect to ensure we have the latest state when
  // submitting. Otherwise, if we call onSubmit directly in the key handler, we
  // might have stale state if the user types something quickly and hits Enter
  // before the state updates.
  {
    const onSubmitEffect = useEffectEvent(() => {
      onSubmit(state.lines.join("\n"));
    });

    const didSubmit = useRef(false);
    useLayoutEffect(() => {
      if (didSubmit.current || !state.submitting) return;
      didSubmit.current = true;
      onSubmitEffect();
    }, [state.submitting]);
  }

  useInput((input, key) => {
    if (key.escape) {
      setState((prev) => {
        if (prev.submitting) return prev;
        return { ...prev, lines: [""], cursorLine: 0, cursorCol: 0 };
      });
      return;
    }

    if (key.return) {
      setState((prev) => {
        if (prev.submitting) return prev;
        const currentLine = prev.lines[prev.cursorLine] || "";
        if (currentLine[prev.cursorCol - 1] !== "\\") {
          return { ...prev, submitting: true };
        }
        const beforeCursor = currentLine.slice(0, prev.cursorCol - 1);
        const afterCursor = currentLine.slice(prev.cursorCol);
        const newLines = [...prev.lines];
        newLines[prev.cursorLine] = beforeCursor;
        newLines.splice(prev.cursorLine + 1, 0, afterCursor);
        return { ...prev, lines: newLines, cursorLine: prev.cursorLine + 1, cursorCol: 0 };
      });
      return;
    }

    // Backspace is misinterpreted as delete by Ink, so we handle both here.
    // https://github.com/vadimdemedes/ink/issues/634
    if (key.backspace || key.delete) {
      setState((prev) => {
        if (prev.submitting) return prev;
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
          return {
            ...prev,
            lines: newLines,
            cursorLine: prev.cursorLine - 1,
            cursorCol: prevLineLength,
          };
        }
        return prev;
      });
      return;
    }

    // if (key.delete) {
    //   setState((prev) => {
    //     if (prev.submitting) return prev;
    //     const currentLine = prev.lines[prev.cursorLine] || "";
    //     if (prev.cursorCol < currentLine.length) {
    //       const newLines = [...prev.lines];
    //       newLines[prev.cursorLine] = currentLine.slice(0, prev.cursorCol) +
    //         currentLine.slice(prev.cursorCol + 1);
    //       return { ...prev, lines: newLines };
    //     } else if (prev.cursorLine < prev.lines.length - 1) {
    //       const newLines = [...prev.lines];
    //       const nextLine = newLines[prev.cursorLine + 1] || "";
    //       newLines[prev.cursorLine] = currentLine + nextLine;
    //       newLines.splice(prev.cursorLine + 1, 1);
    //       return { ...prev, lines: newLines };
    //     }
    //     return prev;
    //   });
    //   return;
    // }

    if (key.upArrow) {
      setState((prev) => {
        if (prev.submitting) return prev;
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
        if (prev.submitting) return prev;
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
        if (prev.submitting) return prev;
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
        if (prev.submitting) return prev;
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
        if (prev.submitting) return prev;
        const inputLines = input.split(/\r\n|\r|\n/g);
        const currentLine = prev.lines[prev.cursorLine] ?? "";
        const newLines = [
          ...prev.lines.slice(0, prev.cursorLine),
          ...inputLines.map((inputLine, i) => {
            if (i === 0) {
              inputLine = currentLine.slice(0, prev.cursorCol) + inputLine;
            }
            if (i === inputLines.length - 1) {
              inputLine = inputLine + currentLine.slice(prev.cursorCol);
            }
            return inputLine;
          }),
          ...prev.lines.slice(prev.cursorLine + 1),
        ];
        return {
          ...prev,
          lines: newLines,
          cursorCol: newLines[prev.cursorLine + inputLines.length - 1].length -
            (currentLine.length - prev.cursorCol),
          cursorLine: prev.cursorLine + inputLines.length - 1,
        };
      });
    }
  }, { isActive: !isDisabled });

  const { lines, cursorLine, cursorCol } = state;

  return (
    <Box flexDirection="column">
      <Box
        flexDirection="column"
        borderStyle="single"
        borderDimColor
        borderLeft={false}
        borderRight={false}
      >
        {lines.map((line, lineIndex) => (
          <Box key={lineIndex}>
            <Text>{lineIndex === 0 ? "❯ " : "  "}</Text>
            {!state.submitting && lineIndex === cursorLine
              ? (
                <>
                  <Text>
                    {/* These strings have to be combined because of https://github.com/vadimdemedes/ink/issues/867 */}
                    {line.slice(0, cursorCol) +
                      chalk.inverse(line[cursorCol] || " ") +
                      line.slice(cursorCol + 1)}
                  </Text>
                </>
              )
              : <Text>{line}</Text>}
          </Box>
        ))}
      </Box>
      <Box>
        <Text color="gray" dimColor>
          ⏎ to submit{" ".repeat(4)}\⏎ for newline
        </Text>
      </Box>
    </Box>
  );
}
