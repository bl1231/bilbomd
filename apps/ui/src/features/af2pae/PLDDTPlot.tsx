import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea
} from 'recharts'
import { PLDDTData } from '../../utils/pdbUtils'

interface PLDDTPlotProps {
  plddtData: PLDDTData[]
  plddtCutoff: number
  chainBoundaries: number[]
}

type ChainRange = {
  start: number
  end: number
  chainId: number
}

const PLDDTPlot: React.FC<PLDDTPlotProps> = ({
  plddtData,
  plddtCutoff,
  chainBoundaries
}) => {
  // Define colors for chain backgrounds
  const chainColors = ['#ffcccc', '#ccffcc', '#ccccff', '#ffffcc', '#ffccff']

  // Compute chain ranges
  const chainRanges: ChainRange[] = []
  let start = 0
  chainBoundaries.forEach((boundary, index) => {
    chainRanges.push({ start, end: boundary - 1, chainId: index + 1 })
    start = boundary
  })
  // Last chain
  chainRanges.push({
    start,
    end: plddtData.length - 1,
    chainId: chainBoundaries.length + 1
  })

  // Custom tooltip to show PDB residue number and chain ID
  const CustomTooltip = ({
    active,
    payload
  }: {
    active?: boolean
    payload?: Array<{ payload: PLDDTData }>
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload
      return (
        <div
          style={{
            backgroundColor: '#fff',
            padding: '5px',
            border: '1px solid #ccc'
          }}
        >
          <p>{`Residue: ${data.residueNumber} (Chain ${data.chainId})`}</p>
          <p>{`pLDDT: ${data.plddt.toFixed(2)}`}</p>
        </div>
      )
    }
    return null
  }

  return (
    <LineChart
      width={500}
      height={300}
      data={plddtData}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="globalIndex"
        tickFormatter={(value) =>
          plddtData.find((d) => d.globalIndex === value)?.residueNumber || value
        }
        label={{
          value: 'Residue Number',
          position: 'insideBottom',
          offset: -5
        }}
      />
      <YAxis
        label={{ value: 'pLDDT Score', angle: -90, position: 'insideLeft' }}
      />
      <Tooltip content={<CustomTooltip />} />
      {chainRanges.map((range, index) => (
        <ReferenceArea
          key={index}
          x1={range.start}
          x2={range.end}
          fill={chainColors[index % chainColors.length]}
          opacity={0.3}
        />
      ))}
      <Line
        type="monotone"
        dataKey="plddt"
        stroke="#8884d8"
        dot={false}
      />
      <ReferenceLine
        y={plddtCutoff}
        stroke="red"
        strokeDasharray="5 5"
        label="Cutoff"
      />
      {chainBoundaries.map((boundary, index) => (
        <ReferenceLine
          key={index}
          x={boundary}
          stroke="green"
          strokeDasharray="6 3"
          strokeWidth={2}
          label={`Chain ${index + 1} Start`}
        />
      ))}
    </LineChart>
  )
}

export default React.memo(PLDDTPlot)
