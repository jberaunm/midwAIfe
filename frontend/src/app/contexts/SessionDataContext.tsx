import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';

interface SessionData {
  session: string;
  metadata: {
    date: string;
    day: string;
    type: string;
    distance: number;
    notes: string;
    session_completed: boolean;
    time_scheduled: any[];
    calendar: {
      events: Array<{
        title: string;
        start: string;
        end: string;
      }>;
    };
    data_points: {
      laps: Array<{
        lap_index: number;
        distance_meters: number;
        pace_ms: number;
        pace_min_km: string;
        heartrate_bpm: number;
        cadence: number;
        elapsed_time: number;
        segment: string;
      }>;
    };
    weather: {
      hours: Array<{
        time: string;
        tempC: string;
        desc: string;
      }>;
    };
    coach_feedback?: string;
  };
}

interface DayStats {
  date: string;
  day_name: string;
  session_type: string;
  planned_distance: number;
  actual_distance: number;
  session_completed: boolean;
  has_activity: boolean;
  is_today: boolean;
  metadata: any;
}

interface WeeklySummary {
  total_distance_planned: number;
  total_distance_completed: number;
  total_sessions: number;
  completed_sessions: number;
  completion_rate: number;
  week_start: string;
  week_end: string;
}

interface WeeklyData {
  status: string;
  data: DayStats[];
  summary: WeeklySummary;
  message: string;
}

interface SessionDataContextType {
  sessionData: SessionData | null;
  weeklyData: WeeklyData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
  forceSchedule: () => void;
  scheduling: boolean;
  justCompletedSegmentation: boolean;
  resetSegmentationFlag: () => void;
  sendMessage: (message: string) => boolean;
}

const SessionDataContext = createContext<SessionDataContextType | undefined>(undefined);

interface SessionDataProviderProps {
  children: ReactNode;
  date: Date;
  websocket?: WebSocket | null;
}

export function SessionDataProvider({ children, date, websocket }: SessionDataProviderProps) {
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  
  // Log sessionData changes
  useEffect(() => {
    console.log('🔄 sessionData state changed:', sessionData);
    if (sessionData) {
      console.log('🔄 Coach feedback available:', !!sessionData.metadata?.coach_feedback);
      console.log('🔄 Data points available:', !!sessionData.metadata?.data_points?.laps);
    }
  }, [sessionData]);
  const [weeklyData, setWeeklyData] = useState<WeeklyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const lastScheduledDate = useRef<string>('');
  const pendingSchedulingDate = useRef<string>('');
  const [justCompletedSegmentation, setJustCompletedSegmentation] = useState(false);
  
  const resetSegmentationFlag = () => {
    setJustCompletedSegmentation(false);
  };

  const sendMessage = (message: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not available for sending message');
      return false;
    }

    const messageObj = {
      mime_type: "text/plain",
      data: message,
      role: "user"
    };
    
    websocket.send(JSON.stringify(messageObj));
    console.log('Message sent via WebSocket:', message);
    return true;
  };

  const getMondayOfWeek = (date: Date) => {
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    return new Date(date.setDate(diff));
  };

  const fetchSessionData = async (specificDate?: string) => {
    console.log('🔄 fetchSessionData called with date:', specificDate || date.toISOString().split('T')[0]);
    setLoading(true);
    setError(null);
    
    try {
      // Use specificDate if provided (for post-scheduling fetch), otherwise use current date prop
      const formattedDate = specificDate || date.toISOString().split('T')[0];
      console.log('🔄 Fetching data for date:', formattedDate);
      const response = await fetch(`http://localhost:8000/api/session/${formattedDate}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log('🔄 Session data fetched:', data);
        console.log('🔄 Coach feedback:', data.metadata?.coach_feedback);
        console.log('🔄 Data points laps:', data.metadata?.data_points?.laps?.length);
        
        // Sort calendar events by start time if they exist
        if (data.metadata?.calendar?.events) {
          data.metadata.calendar.events.sort((a: any, b: any) => {
            // Convert time strings to comparable values (e.g., "06:00" -> 600, "15:30" -> 1530)
            const timeA = parseInt(a.start.replace(':', ''));
            const timeB = parseInt(b.start.replace(':', ''));
            return timeA - timeB; // Ascending order
          });
        }
        
        setSessionData(data);
        console.log('🔄 Session data updated in state');
        
        // Reset the segmentation flag after data is updated
        if (justCompletedSegmentation) {
          console.log('🔄 Resetting segmentation completion flag');
          setJustCompletedSegmentation(false);
        }
      } else {
        console.log('❌ Failed to fetch session data:', response.status);
        setError('No session found for this date');
        setSessionData(null);
      }
    } catch (err) {
      console.error('Error fetching session data:', err);
      setError('Failed to load session data');
      setSessionData(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchWeeklyData = async () => {
    try {
      const monday = getMondayOfWeek(new Date(date));
      const startDate = monday.toISOString().split('T')[0];
      
      const response = await fetch(`http://localhost:8000/api/weekly/${startDate}`);
      
      if (response.ok) {
        const data: WeeklyData = await response.json();
        setWeeklyData(data);
      } else {
        console.error('Failed to fetch weekly data:', response.status);
        setWeeklyData(null);
      }
    } catch (err) {
      console.error('Error fetching weekly data:', err);
      setWeeklyData(null);
    }
  };

  const scheduleDay = async (formattedDate: string) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      console.warn('WebSocket not available for scheduling');
      return;
    }

    setScheduling(true);
    pendingSchedulingDate.current = formattedDate;
    
    // Set a fallback timeout in case WebSocket response doesn't come through
    const fallbackTimeout = setTimeout(() => {
      if (pendingSchedulingDate.current === formattedDate) {
        console.warn(`Scheduling timeout for ${formattedDate}, fetching data anyway`);
        fetchSessionData(formattedDate);
        fetchWeeklyData(); // Also refresh weekly data
        setScheduling(false);
        pendingSchedulingDate.current = '';
      }
    }, 90000); // 30 second fallback timeout
    
    try {
      const message = {
        mime_type: "text/plain",
        data: `Day overview for ${formattedDate}?`,
        role: "user"
      };
      
      websocket.send(JSON.stringify(message));
      console.log(`Day overview request sent for ${formattedDate}`);
      
      // Store the timeout ID to clear it if we get a response
      (scheduleDay as any).fallbackTimeout = fallbackTimeout;
      
    } catch (err) {
      console.error('Error sending Day overview request:', err);
      setScheduling(false);
      pendingSchedulingDate.current = '';
      clearTimeout(fallbackTimeout);
    }
  };

  // Listen for WebSocket messages to detect when agents finish processing
  useEffect(() => {
    if (!websocket) return;

    const handleMessage = (event: MessageEvent) => {
      const messageText = event.data;
      console.log('WebSocket message received:', messageText);
      console.log('Message type:', typeof messageText);
      console.log('Message length:', messageText.length);
      
      // First check for orchestrator_agent completion messages (both JSON and text)
      if (typeof messageText === 'string' && messageText.includes('[ORCHESTRATOR_AGENT] FINISH:')) {
        console.log('✅ ORCHESTRATOR_AGENT message detected:', messageText);
        console.log('✅ Orchestrator agent completed, refreshing all data');
        // Reset scheduling state to stop loading
        setScheduling(false);
        // Refresh both session and weekly data when orchestrator completes
        const currentDate = date.toISOString().split('T')[0];
        fetchSessionData(currentDate);
        fetchWeeklyData();
        return; // Don't process as JSON if it's an orchestrator_agent message
      }
      
      // Then check for analyser_agent completion messages (both JSON and text)
      if (typeof messageText === 'string' && messageText.includes('[ANALYSER_AGENT] FINISH:')) {
        console.log('✅ ANALYSER_AGENT message detected:', messageText);
        if (messageText.includes('Segmentation') || messageText.includes('Insights') || messageText.includes('Analysis of activity') || messageText.includes('Segmentation Only') || messageText.includes('Successfully completed')) {
          console.log('✅ Analyser agent completed, refreshing session data');
          // Set flag to indicate segmentation just completed
          setJustCompletedSegmentation(true);
          // Refresh session data to get the latest segmented data or insights
          const currentDate = date.toISOString().split('T')[0];
          fetchSessionData(currentDate);
        } else {
          console.log('❌ Message contains ANALYSER_AGENT but not completion keywords');
        }
        return; // Don't process as JSON if it's an analyser_agent message
      } else {
        console.log('❌ Not an ANALYSER_AGENT message or not a string');
      }
      
      // Catch-all detection for any message containing the completion pattern
      if (typeof messageText === 'string' && messageText.includes('Segmentation Only Successfully completed')) {
        console.log('✅ Catch-all detection: Segmentation Only Successfully completed found');
        console.log('✅ Analyser agent completed, refreshing session data');
        const currentDate = date.toISOString().split('T')[0];
        fetchSessionData(currentDate);
        return;
      }
      
      try {
        const data = JSON.parse(event.data);
        
        // Check for orchestrator_agent completion in JSON messages (log_message format)
        if (data.log_message && typeof data.log_message === 'string' && data.log_message.includes('[ORCHESTRATOR_AGENT] FINISH:')) {
          console.log('✅ ORCHESTRATOR_AGENT message detected in JSON log_message:', data.log_message);
          console.log('✅ Orchestrator agent completed, refreshing all data');
          // Reset scheduling state to stop loading
          setScheduling(false);
          // Refresh both session and weekly data when orchestrator completes
          const currentDate = date.toISOString().split('T')[0];
          fetchSessionData(currentDate);
          fetchWeeklyData();
        }
        
        // Check for analyser_agent completion in JSON messages (log_message format)
        if (data.log_message && typeof data.log_message === 'string' && data.log_message.includes('[ANALYSER_AGENT] FINISH:')) {
          console.log('✅ ANALYSER_AGENT message detected in JSON log_message:', data.log_message);
          if (data.log_message.includes('Segmentation') || data.log_message.includes('Insights') || data.log_message.includes('Analysis of activity') || data.log_message.includes('Segmentation Only') || data.log_message.includes('Successfully completed')) {
            console.log('✅ Analyser agent completed, refreshing session data');
            // Set flag to indicate segmentation just completed
            setJustCompletedSegmentation(true);
            // Refresh session data to get the latest segmented data or insights
            const currentDate = date.toISOString().split('T')[0];
            fetchSessionData(currentDate);
          } else {
            console.log('❌ JSON log_message contains ANALYSER_AGENT but not completion keywords');
          }
        }
        
        // Also check for content field (fallback) - orchestrator agent
        if (data.content && typeof data.content === 'string' && data.content.includes('[ORCHESTRATOR_AGENT] FINISH:')) {
          console.log('✅ ORCHESTRATOR_AGENT message detected in JSON content:', data.content);
          console.log('✅ Orchestrator agent completed, refreshing all data');
          // Reset scheduling state to stop loading
          setScheduling(false);
          // Refresh both session and weekly data when orchestrator completes
          const currentDate = date.toISOString().split('T')[0];
          fetchSessionData(currentDate);
          fetchWeeklyData();
        }
        
        // Also check for content field (fallback) - analyser agent
        if (data.content && typeof data.content === 'string' && data.content.includes('[ANALYSER_AGENT] FINISH:')) {
          console.log('✅ ANALYSER_AGENT message detected in JSON content:', data.content);
          if (data.content.includes('Segmentation') || data.content.includes('Insights') || data.content.includes('Analysis of activity') || data.content.includes('Segmentation Only') || data.content.includes('Successfully completed')) {
            console.log('✅ Analyser agent completed, refreshing session data');
            // Set flag to indicate segmentation just completed
            setJustCompletedSegmentation(true);
            // Refresh session data to get the latest segmented data or insights
            const currentDate = date.toISOString().split('T')[0];
            fetchSessionData(currentDate);
          } else {
            console.log('❌ JSON content contains ANALYSER_AGENT but not completion keywords');
          }
        }
        
      } catch (err) {
        // Ignore parsing errors for non-JSON messages
        console.log('Non-JSON message received:', messageText);
      }
    };

    websocket.addEventListener('message', handleMessage);
    
    return () => {
      websocket.removeEventListener('message', handleMessage);
    };
  }, [websocket, date]);

  useEffect(() => {
    const formattedDate = date.toISOString().split('T')[0];
    
    // Only fetch existing data, don't automatically schedule
    if (formattedDate !== lastScheduledDate.current) {
      lastScheduledDate.current = formattedDate;
      
      // Just fetch existing data without automatic scheduling
      fetchSessionData();
      fetchWeeklyData(); // Also fetch weekly data when date changes
    }
  }, [date, websocket]);

  const refetch = () => {
    fetchSessionData();
    fetchWeeklyData(); // Also refresh weekly data
  };

  const forceSchedule = () => {
    const formattedDate = date.toISOString().split('T')[0];
    scheduleDay(formattedDate);
  };

  return (
    <SessionDataContext.Provider value={{ 
      sessionData, 
      weeklyData,
      loading: loading || scheduling, 
      error, 
      refetch, 
      forceSchedule,
      scheduling,
      justCompletedSegmentation,
      resetSegmentationFlag,
      sendMessage
    }}>
      {children}
    </SessionDataContext.Provider>
  );
}

export function useSessionData() {
  const context = useContext(SessionDataContext);
  if (context === undefined) {
    throw new Error('useSessionData must be used within a SessionDataProvider');
  }
  return context;
} 