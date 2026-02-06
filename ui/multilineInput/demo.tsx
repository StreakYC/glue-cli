#!/usr/bin/env -S deno run --allow-env
import { useEffect, useState } from "react";
import { Box, render, Text, useApp } from "ink";
import { MultilineInput } from "./MultilineInput.tsx";

export function MultilineInputDemo() {
  const { exit } = useApp();
  const [submitted, setSubmitted] = useState<string | null>(null);

  useEffect(() => {
    if (submitted !== null) {
      exit();
    }
  }, [submitted, exit]);

  if (submitted !== null) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="green" bold>
          ✔ Submitted!
        </Text>
        <Text>You entered:</Text>
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginTop={1}
        >
          {submitted.split("\n").map((line, i) => <Text key={i}>{line || " "}</Text>)}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Multiline Input Demo</Text>
      <Box marginY={1}>
        <MultilineInput
          onSubmit={setSubmitted}
        />
      </Box>
    </Box>
  );
}

render(<MultilineInputDemo />);
