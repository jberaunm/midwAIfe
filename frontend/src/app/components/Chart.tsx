import React from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { useSessionData } from "../contexts/SessionDataContext";

interface ChartProps {
  date: Date;
}

export default function Chart({ date }: ChartProps) {
  const { sessionData, loading, error } = useSessionData();
  
  // Extract laps data from session metadata
  const laps = sessionData?.metadata?.data_points?.laps || [];

  if (loading) {
    return (
      <div className="stat-card chart-card">
        <h1>Running Chart</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
          Loading chart data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stat-card chart-card">
        <h1>Running Chart</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#f44336" }}>
          Error: {error}
        </div>
      </div>
    );
  }

  if (!laps || laps.length === 0) {
    return (
      <div className="stat-card chart-card">
        <h1>Running Chart</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
          No running data available for this session.
        </div>
      </div>
    );
  }

  // Process the data to create cumulative distance
  const cumulativeData = (() => {
    let cumulativeDistance = 0;
    return laps.map(lap => {
      cumulativeDistance += lap.distance_meters || 0;
      return { 
        ...lap, 
        cumulative_distance: parseFloat((cumulativeDistance / 1000).toFixed(1)) 
      };
    });
  })();

  // Function to format the pace from m/s to min:s/km
  const formatPace = (value: number) => {
    if (value === 0) return '0:00/km';
    const timeInSeconds = 1000 / value;
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.round(timeInSeconds % 60);
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${formattedSeconds}`;
  };

  const maxDistance = Math.max(...laps.map(lap => lap.distance_meters || 0));

  // Custom Bar component for dynamic width based on distance
  const CustomBar = (props: any) => {
    const { x, y, width, height, payload } = props;
    const dynamicWidth = ((payload.distance_meters || 0) / maxDistance) * 25;
    const xOffset = (width - dynamicWidth) / 2;
    return <rect x={x + xOffset} y={y} width={dynamicWidth} height={height} fill={props.fill} />;
  };

  // Custom Tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = laps.find(lap => 
        lap.lap_index === cumulativeData.find(cd => cd.cumulative_distance === label)?.lap_index
      );

      if (dataPoint) {
        return (
          <div className="custom-tooltip">
            <p className="tooltip-title">{`Cumulative Distance: ${label} km`}</p>
            <p className="tooltip-pace">Pace: {dataPoint.pace_min_km || formatPace(dataPoint.pace_ms || 0)}</p>
            <p className="tooltip-heartrate">Heartrate: {dataPoint.heartrate_bpm || 0} BPM</p>
            <p className="tooltip-cadence">Cadence: {dataPoint.cadence || 0} spm</p>
            <p className="tooltip-segment">Segment: {dataPoint.segment || 'Unknown'}</p>
          </div>
        );
      }
    }
    return null;
  };

  // Calculate segment statistics using existing segment data from agent
  const segmentStats = laps.length > 0 ? (() => {
    // Helper function to convert pace from m/s to min:sec/km format
    const formatPace = (paceMs: number) => {
      if (paceMs === 0) return '0:00/km';
      const timeInSeconds = 1000 / paceMs;
      const minutes = Math.floor(timeInSeconds / 60);
      const seconds = Math.round(timeInSeconds % 60);
      const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
      return `${minutes}:${formattedSeconds}/km`;
    };
    
    // Group laps by their segment field, or use "Main" as default
    const segmentGroups = new Map();
    
    laps.forEach(lap => {
      const segmentName = lap.segment || 'Main';
      const paceMs = lap.pace_ms || 0;
      const heartRate = lap.heartrate_bpm || 0;
      const distance = lap.distance_meters || 0;
      
      if (!segmentGroups.has(segmentName)) {
        segmentGroups.set(segmentName, {
          name: segmentName,
          totalDistance: 0,
          totalPaceMs: 0,
          totalHeartRate: 0,
          lapCount: 0,
          startLap: lap.lap_index,
          endLap: lap.lap_index
        });
      }
      
      const segment = segmentGroups.get(segmentName);
      segment.totalDistance += distance;
      segment.totalPaceMs += paceMs;
      segment.totalHeartRate += heartRate;
      segment.lapCount += 1;
      segment.endLap = lap.lap_index;
    });
    
    // Convert to array and calculate averages
    return Array.from(segmentGroups.values()).map(segment => ({
      ...segment,
      avgPaceMs: segment.totalPaceMs / segment.lapCount,
      avgHeartRate: Math.round(segment.totalHeartRate / segment.lapCount),
      distanceKm: (segment.totalDistance / 1000).toFixed(1),
      paceFormatted: formatPace(segment.totalPaceMs / segment.lapCount)
    }));
  })() : [];

  return (
    <div className="stat-card chart-card">
      <h1>Running Chart</h1>
      
      <div className="chart-container">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={cumulativeData}
            margin={{ top: 2, right: -30, left: -30, bottom: 8 }}
          >
            {/* Creates a grid background for the chart */}
            <CartesianGrid
              strokeDasharray="1 1 1"
              stroke="#40403e"
              strokeOpacity={0.8} />
            
            {/* Defines the X-axis, using the cumulative distance */}
            <XAxis 
              dataKey="cumulative_distance" 
              stroke="#40403e" 
              tick={{ fontSize: 12 }}
              label={{ value: 'Distance (km)', position: 'insideBottom', fill: '#40403e', fontSize: 13, offset: -3 }}
              padding={{ left: 6, right: 6 }}  
            />
            
            {/* Defines the primary Y-axis for pace data with custom tick formatting */}
            <YAxis 
              yAxisId="left"
              stroke="#4e9cea"
              tickFormatter={formatPace}
              tick={{ fontSize: 11 }}
              type="number" domain={[2, (dataMax: number) => (dataMax * 1.1)]}
            />

            {/* Defines the secondary Y-axis for heart rate data */}
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#cc785c"
              tick={{ fontSize: 11 }}
              type="number" domain={[40, (dataMax: number) => (dataMax * 1.05)]}
            />
            
            {/* Provides a floating tooltip when hovering over data points */}
            <Tooltip
              content={<CustomTooltip />}
              contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '0.5rem' }}
            />
            
            {/* A legend to identify the different chart series */}
            <Legend
              verticalAlign="top"
              height={30}
              iconSize={10}
              wrapperStyle={{ paddingTop: '1px', fontSize: '13px' }}
            />
            
            {/* The Bar series for pace data */}
            <Bar yAxisId="left" dataKey="pace_ms" fill="#4e9cea" name="Pace (min/km)" shape={<CustomBar />} />
            
            {/* The Line series for heart rate data, using the second Y-axis */}
            <Line yAxisId="right" type="monotone" dataKey="heartrate_bpm" stroke="#cc785c" name="Heartrate (BPM)" />

          </ComposedChart>
        </ResponsiveContainer>
      </div>
      
      {/* Segments Display - Always visible when data is available, placed at bottom */}
      {segmentStats.length > 0 && (
        <div className="segments-section" style={{ marginTop: "20px" }}>
          <div className="segments-grid">
            {segmentStats.map((segment, index) => (
              <div key={index} className="segment-item">
                <div className="segment-name">{segment.name}</div>
                <div className="segment-distance">{segment.distanceKm} km</div>
                <div className="segment-pace">{segment.paceFormatted}</div>
                <div className="segment-heartrate">{segment.avgHeartRate} BPM</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
