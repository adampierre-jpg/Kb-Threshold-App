import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceDot,
} from 'recharts';
import type { AnalysisResult } from '../types';
import { MOVEMENT_LABELS } from '../types';
import { formatTime, formatPercent, formatSpeed } from '../utils/format';

interface ResultsDashboardProps {
  result: AnalysisResult;
  onReset: () => void;
}

export function ResultsDashboard({ result, onReset }: ResultsDashboardProps) {
  const chartData = useMemo(() => {
    return result.rep_metrics.map((rep) => ({
      rep: rep.rep_index + 1,
      speed: rep.peak_speed,
      isBelowThreshold: rep.is_below_threshold,
    }));
  }, [result.rep_metrics]);

  const thresholdSpeed = result.baseline_speed * 0.8; // 20% drop threshold

  const antChartPoint = result.ant_rep_index !== null
    ? chartData.find((d) => d.rep === result.ant_rep_index + 1)
    : null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          label="Movement"
          value={MOVEMENT_LABELS[result.movement_type]}
          accent
        />
        <SummaryCard
          label="Valid Reps"
          value={result.total_valid_reps.toString()}
        />
        <SummaryCard
          label="ANT Rep"
          value={result.ant_rep_index !== null ? `Rep ${result.ant_rep_index + 1}` : 'Not Reached'}
          highlight={result.ant_reached}
        />
        <SummaryCard
          label="ANT Time"
          value={result.ant_timestamp_seconds !== null ? formatTime(result.ant_timestamp_seconds) : '--:--'}
          highlight={result.ant_reached}
        />
      </div>

      {/* Speed Chart */}
      <div className="bg-dark-300 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-white mb-4">Rep Speed Profile</h3>
        <div className="h-64 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="rep"
                stroke="#888"
                tick={{ fill: '#888', fontSize: 12 }}
                label={{ value: 'Rep #', position: 'insideBottom', offset: -5, fill: '#888' }}
              />
              <YAxis
                stroke="#888"
                tick={{ fill: '#888', fontSize: 12 }}
                label={{ value: 'Speed', angle: -90, position: 'insideLeft', fill: '#888' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1F1F1F',
                  border: '1px solid #333',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#fff' }}
                formatter={(value: number) => [formatSpeed(value), 'Speed']}
                labelFormatter={(label) => `Rep ${label}`}
              />
              {/* Baseline reference */}
              <ReferenceLine
                y={result.baseline_speed}
                stroke="#4CAF50"
                strokeDasharray="5 5"
                label={{ value: 'Baseline', fill: '#4CAF50', fontSize: 10 }}
              />
              {/* Threshold reference */}
              <ReferenceLine
                y={thresholdSpeed}
                stroke="#FF9800"
                strokeDasharray="5 5"
                label={{ value: '80% Threshold', fill: '#FF9800', fontSize: 10 }}
              />
              <Line
                type="monotone"
                dataKey="speed"
                stroke="#722F37"
                strokeWidth={2}
                dot={{ fill: '#722F37', r: 3 }}
                activeDot={{ r: 6, fill: '#722F37' }}
              />
              {/* ANT point marker */}
              {antChartPoint && (
                <ReferenceDot
                  x={antChartPoint.rep}
                  y={antChartPoint.speed}
                  r={8}
                  fill="#FF5722"
                  stroke="#fff"
                  strokeWidth={2}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-wrap gap-4 mt-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-green-500" />
            <span className="text-gray-400">Baseline Speed</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-0.5 bg-orange-500" />
            <span className="text-gray-400">80% Threshold</span>
          </div>
          {result.ant_reached && (
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-600" />
              <span className="text-gray-400">ANT Point</span>
            </div>
          )}
        </div>
      </div>

      {/* Coach Explanation */}
      <div className="bg-dark-300 rounded-xl p-4 sm:p-6">
        <h3 className="text-lg font-semibold text-white mb-3">Analysis Summary</h3>
        <p className="text-gray-300 leading-relaxed">
          {result.ant_reached ? (
            <>
              Your <span className="text-oxblood-300 font-medium">{MOVEMENT_LABELS[result.movement_type]}</span> ANT
              occurred on <span className="text-white font-medium">rep {result.ant_rep_index! + 1}</span> at{' '}
              <span className="text-white font-medium">{formatTime(result.ant_timestamp_seconds!)}</span>,
              when rep speed dropped more than{' '}
              <span className="text-white font-medium">{formatPercent(result.drop_percent_at_ant!)}</span> from
              your early-set baseline of {formatSpeed(result.baseline_speed)}. This indicates the point where
              fatigue began to significantly impact your movement quality. Training at or just below this rep
              count helps build work capacity without excessive fatigue accumulation.
            </>
          ) : (
            <>
              No ANT was detected during your <span className="text-oxblood-300 font-medium">{MOVEMENT_LABELS[result.movement_type]}</span> set
              of <span className="text-white font-medium">{result.total_valid_reps} reps</span>.
              This means your rep speed remained above 80% of baseline throughout the set.
              You may have more capacity to push further, or consider using a heavier bell to challenge your threshold.
            </>
          )}
        </p>
      </div>

      {/* Rep Table */}
      <div className="bg-dark-300 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-dark-200">
          <h3 className="text-lg font-semibold text-white">Rep Details</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-dark-400">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Rep #</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Time</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Duration</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Peak Speed</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-200">
              {result.rep_metrics.map((rep) => {
                const isAntRep = result.ant_rep_index === rep.rep_index;
                return (
                  <tr
                    key={rep.rep_index}
                    className={`${isAntRep ? 'bg-oxblood/20' : 'hover:bg-dark-200'}`}
                  >
                    <td className="px-4 py-3 text-white font-medium">
                      {rep.rep_index + 1}
                      {isAntRep && (
                        <span className="ml-2 text-xs bg-oxblood px-2 py-0.5 rounded">ANT</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-300">{formatTime(rep.start_time)}</td>
                    <td className="px-4 py-3 text-gray-300">{rep.duration.toFixed(2)}s</td>
                    <td className="px-4 py-3 text-gray-300">{formatSpeed(rep.peak_speed)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          rep.is_below_threshold
                            ? 'bg-orange-500/20 text-orange-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                      >
                        {rep.is_below_threshold ? 'Below Threshold' : 'Above Threshold'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset Button */}
      <button
        onClick={onReset}
        className="w-full py-4 px-6 rounded-xl font-semibold border border-oxblood text-oxblood-300 hover:bg-oxblood/10 transition-all"
      >
        Analyze Another Video
      </button>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: string;
  accent?: boolean;
  highlight?: boolean;
}

function SummaryCard({ label, value, accent, highlight }: SummaryCardProps) {
  return (
    <div
      className={`rounded-xl p-4 ${
        highlight
          ? 'bg-oxblood/20 border border-oxblood-400'
          : accent
          ? 'bg-dark-300 border border-oxblood-400/30'
          : 'bg-dark-300'
      }`}
    >
      <p className="text-gray-400 text-sm mb-1">{label}</p>
      <p className={`text-xl font-semibold ${highlight ? 'text-oxblood-300' : 'text-white'}`}>
        {value}
      </p>
    </div>
  );
}
