import { Box, Text, useWindowSize } from "ink";
import { StackedBarChart } from "ink-chart";

export function RunSummary({ label, counts }: {
  label: string;
  counts: { totalCount: number; totalErrorCount: number };
}) {
  const { columns } = useWindowSize();
  const chartWidth = Math.max(1, Math.floor(columns / 2));
  const successful = counts.totalCount - counts.totalErrorCount;
  const failed = counts.totalErrorCount;
  const percentage = (count: number) =>
    counts.totalCount === 0 ? "0.0" : (100 * count / counts.totalCount).toFixed(1);
  const data = [
    { label: "Successful", value: successful, color: "green", char: "█" },
    { label: "Failed", value: failed, color: "red", char: "▓" },
  ].filter((segment) => segment.value > 0);

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>{label}:</Text>
      {counts.totalCount > 0
        ? <StackedBarChart data={data} width={chartWidth} showLabels={false} showValues={false} />
        : <Text dimColor>No runs</Text>}
      <Text>
        <Text color="green">
          {successful.toLocaleString("en-US")} successful ({percentage(successful)}%)
        </Text>
        {", "}
        <Text color="red">{failed.toLocaleString("en-US")} failed ({percentage(failed)}%)</Text>
      </Text>
    </Box>
  );
}
