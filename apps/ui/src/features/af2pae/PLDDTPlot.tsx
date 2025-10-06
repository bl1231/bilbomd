import React from 'react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts'
import { PLDDTData } from '../../utils/pdbUtils'

interface PLDDTPlotProps {
  plddtData: PLDDTData[]
  plddtCutoff: number
}

const PLDDTPlot: React.FC<PLDDTPlotProps> = ({ plddtData, plddtCutoff }) => {
  return (
    <LineChart
      width={400}
      height={300}
      data={plddtData}
    >
      <CartesianGrid strokeDasharray="3 3" />
      <XAxis
        dataKey="residueNumber"
        label={{
          value: 'Residue Number',
          position: 'insideBottom',
          offset: -5
        }}
      />
      <YAxis
        label={{ value: 'pLDDT Score', angle: -90, position: 'insideLeft' }}
      />
      <Tooltip />
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
    </LineChart>
  )
}

export default PLDDTPlot
