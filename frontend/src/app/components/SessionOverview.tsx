import React, { useState, useEffect, useRef } from 'react';
import Chart from './Chart';
import Insights from './Insights';
import { useSessionData } from "../contexts/SessionDataContext";

interface SessionOverviewProps {
  date: Date;
}

export default function SessionOverview({ date }: SessionOverviewProps) {
  const { sessionData, loading, error, justCompletedSegmentation, resetSegmentationFlag } = useSessionData();
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  
  // Refs to track state
  const lastProcessedDate = useRef<string>('');  // Tracks which date we've already processed
  const hasProcessedSegmentation = useRef<boolean>(false);  // Tracks if we've processed segmentation for this date

  // Reset popup state when date changes
  useEffect(() => {
    const currentDateStr = date.toISOString().split('T')[0];
    
    // Only reset if we're actually changing to a different date
    if (lastProcessedDate.current !== currentDateStr) {
      lastProcessedDate.current = currentDateStr;
      hasProcessedSegmentation.current = false;
      setIsPopupOpen(false);
      // Reset the segmentation flag when date changes to prevent auto-popup on navigation
      resetSegmentationFlag();
    }
  }, [date, resetSegmentationFlag]);

  // Auto-popup only when segmentation workflow just completed (not when navigating to existing data)
  useEffect(() => {
    if (sessionData && !loading && !error && justCompletedSegmentation) {
      const hasSegmentedData = sessionData.metadata?.data_points?.laps && sessionData.metadata.data_points.laps.length > 0;
      const currentDateStr = date.toISOString().split('T')[0];
      
      // Only auto-popup if:
      // 1. We have segmented data
      // 2. We haven't already processed segmentation for this date
      // 3. The segmentation just completed (justCompletedSegmentation flag is true)
      // 4. We're on the same date that was just processed
      if (hasSegmentedData && !hasProcessedSegmentation.current && lastProcessedDate.current === currentDateStr) {
        console.log('🔄 Auto-popup: Segmentation just completed, opening popup');
        hasProcessedSegmentation.current = true;
        setIsPopupOpen(true);
      }
    }
  }, [sessionData, loading, error, date, justCompletedSegmentation]);

  const handleCardClick = () => {
    setIsPopupOpen(true);
  };

  const handleClosePopup = () => {
    setIsPopupOpen(false);
  };

  // Extract basic session information for the compact view
  const sessionInfo = sessionData?.metadata;
  const hasData = sessionInfo?.data_points?.laps && sessionInfo.data_points.laps.length > 0;
  const hasInsights = sessionInfo?.coach_feedback;
  
  // Calculate some basic stats if data is available
  const totalDistance = hasData ? sessionInfo.data_points.laps.reduce((sum, lap) => sum + (lap.distance_meters || 0), 0) : 0;
  const avgHeartRate = hasData ? Math.round(sessionInfo.data_points.laps.reduce((sum, lap) => sum + (lap.heartrate_bpm || 0), 0) / sessionInfo.data_points.laps.length) : 0;
  
  // Helper function to convert pace from m/s to min:sec/km format
  const formatPace = (paceMs: number) => {
    if (paceMs === 0) return '0:00/km';
    const timeInSeconds = 1000 / paceMs;
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = Math.round(timeInSeconds % 60);
    const formattedSeconds = seconds < 10 ? `0${seconds}` : seconds;
    return `${minutes}:${formattedSeconds}/km`;
  };

  // Calculate segment statistics using existing segment data from agent
  // The agent has already analyzed the session and assigned segment names
  // If no segment field exists, default to "Main" segment
  const segmentStats = hasData ? (() => {
    const laps = sessionInfo.data_points.laps;
    
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

  if (loading) {
    return (
      <div className="stat-card session-overview-card">
        <h1>Session Overview</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
          Loading session data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stat-card session-overview-card">
        <h1>Session Overview</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
          No data available for this session
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Compact Overview Card */}
      <div 
        className="stat-card session-overview-card clickable"
        onClick={handleCardClick}
        style={{ cursor: 'pointer', width: '100%' }}
      >
        <h1>Session Overview</h1>
        {sessionInfo?.type && (
          <div className="session-type-indicator">
            {sessionInfo.type}
          </div>
        )}
        <div className="session-overview-content">
          {!hasData && !hasInsights ? (
            <div style={{ textAlign: "center", padding: "20px", color: "#666", fontStyle: "italic" }}>
              No session data available. Complete a training session to see your overview.
            </div>
          ) : (
            <div className="overview-summary">             
              {/* Session Segments */}
              {segmentStats.length > 0 && (
                <div className="segments-section">
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
              
              <div className="overview-hint">
                Click to view detailed analysis
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Popup Modal */}
      {isPopupOpen && (
        <div className="session-overview-popup-overlay" onClick={handleClosePopup}>
          <div className="session-overview-popup" onClick={(e) => e.stopPropagation()}>
            <div className="popup-header">
              <h1>Session Analysis</h1>
              <button 
                className="popup-close-btn"
                onClick={handleClosePopup}
                aria-label="Close popup"
              >
                ×
              </button>
            </div>
            <div className="popup-content">
              <div className="popup-left-column">
                <Chart date={date} />
              </div>
              <div className="popup-right-column">
                <Insights date={date} />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
