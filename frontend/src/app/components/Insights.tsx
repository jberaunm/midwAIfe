import React, { useState } from "react";
import { useSessionData } from "../contexts/SessionDataContext";

interface InsightsProps {
  date: Date;
}

// Simple markdown parser for basic formatting
const parseMarkdown = (text: string) => {
  if (!text) return text;
  
  // First, normalize the text to handle cases where headers are followed immediately by content
  // Add line breaks after headers if they're missing
  let normalizedText = text
    .replace(/(###\s+[^\n]+)\s+(?=\*\*)/g, '$1\n\n')
    .replace(/(##\s+[^\n]+)\s+(?=\*\*)/g, '$1\n\n')
    .replace(/(#\s+[^\n]+)\s+(?=\*\*)/g, '$1\n\n');
  
  // Split into lines for better processing
  const lines = normalizedText.split('\n');
  let result = [];
  let inList = false;
  let listItems = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    if (!line) {
      // Empty line - end current list if we're in one
      if (inList && listItems.length > 0) {
        result.push(renderList(listItems));
        listItems = [];
        inList = false;
      }
      result.push('<br>');
      continue;
    }
    
    // Check if this is a header
    if (line.startsWith('### ')) {
      if (inList && listItems.length > 0) {
        result.push(renderList(listItems));
        listItems = [];
        inList = false;
      }
      result.push(`<h3>${line.substring(4)}</h3>`);
      continue;
    }
    
    if (line.startsWith('## ')) {
      if (inList && listItems.length > 0) {
        result.push(renderList(listItems));
        listItems = [];
        inList = false;
      }
      result.push(`<h2>${line.substring(3)}</h2>`);
      continue;
    }
    
    if (line.startsWith('# ')) {
      if (inList && listItems.length > 0) {
        result.push(renderList(listItems));
        listItems = [];
        inList = false;
      }
      result.push(`<h1>${line.substring(2)}</h1>`);
      continue;
    }
    
    // Check if this is a numbered list item
    if (/^\d+\.\s/.test(line)) {
      inList = true;
      const content = line.replace(/^\d+\.\s/, '');
      listItems.push(`<li>${parseInlineMarkdown(content)}</li>`);
      continue;
    }
    
    // Check if this is a bullet list item
    if (/^[-*]\s/.test(line)) {
      inList = true;
      const content = line.replace(/^[-*]\s/, '');
      listItems.push(`<li>${parseInlineMarkdown(content)}</li>`);
      continue;
    }
    
    // If we were in a list but this line isn't a list item, end the list
    if (inList && listItems.length > 0) {
      result.push(renderList(listItems));
      listItems = [];
      inList = false;
    }
    
    // Regular paragraph text
    if (line) {
      result.push(`<p>${parseInlineMarkdown(line)}</p>`);
    }
  }
  
  // Don't forget to render any remaining list items
  if (inList && listItems.length > 0) {
    result.push(renderList(listItems));
  }
  
  return result.join('');
};

// Helper function to render lists
const renderList = (items: string[]) => {
  // Check if it's a numbered list (first item starts with a number)
  const isNumbered = /^\d+\./.test(items[0]);
  const tag = isNumbered ? 'ol' : 'ul';
  return `<${tag} class="${isNumbered ? 'numbered-list' : 'bullet-list'}">${items.join('')}</${tag}>`;
};

// Helper function to parse inline markdown (bold, italic)
const parseInlineMarkdown = (text: string) => {
  let parsed = text;
  // Handle bold text (**text**)
  parsed = parsed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Handle italic text (*text*)
  parsed = parsed.replace(/\*(.*?)\*/g, '<em>$1</em>');
  return parsed;
};

export default function Insights({ date }: InsightsProps) {
  const { sessionData, loading, error, sendMessage } = useSessionData();
  
  // Extract coach_feedback from session metadata
  const coachFeedback = sessionData?.metadata?.coach_feedback;
  
  // State for RPE and feedback form
  const [rpeValue, setRpeValue] = useState(3);
  const [feedbackText, setFeedbackText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // RPE descriptions (0-5 scale)
  const rpeDescriptions = {
    0: "No effort - resting",
    1: "Very light effort like walking", 
    2: "Light effort, comfortable pace where you can easily hold a conversation",
    3: "Moderate effort, breathing is heavier but you can still talk",
    4: "Hard effort, breathing is heavy and it's hard to talk",
    5: "Maximum, all-out effort"
  };

  // Handle form submission
  const handleSubmit = async () => {
    if (!feedbackText.trim()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Format the date for the request
      const dateStr = date.toISOString().split('T')[0];
      
      // Create the request message for analyser_agent Main Workflow 2
      const requestMessage = `Insights for activity with ${dateStr}, RPE: ${rpeValue} and Feedback: ${feedbackText}`;
      
      console.log("Submitting to analyser_agent:", requestMessage);
      
      // Send the message via WebSocket
      const success = sendMessage(requestMessage);
      
      if (success) {
        // Keep the form values visible after successful submission
        // Don't clear the form so user can see what they submitted
        setIsSubmitted(true);
        console.log("Feedback submitted successfully");
      }
    } catch (error) {
      console.error("Error submitting feedback:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="stat-card insights-card">
        <h1>Insights</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#666" }}>
          Loading insights...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="stat-card insights-card">
        <h1>Insights</h1>
        <div style={{ textAlign: "center", padding: "20px", color: "#f44336" }}>
          Error: {error}
        </div>
      </div>
    );
  }

  // Check if we have segmented data
  const hasSegmentedData = sessionData?.metadata?.data_points?.laps && sessionData.metadata.data_points.laps.length > 0;

  // If we have coach feedback, show it; otherwise show the RPE form
  if (coachFeedback) {
    const parsedFeedback = parseMarkdown(coachFeedback);

    return (
      <div className="stat-card insights-card">
        <h1>Insights</h1>
        <div className="insights-content">
          <div 
            className="coach-feedback"
            dangerouslySetInnerHTML={{ __html: parsedFeedback }}
          />
        </div>
      </div>
    );
  }

  // Show RPE form when no coach feedback
  return (
    <div className="stat-card insights-card">
      <h1>Insights</h1>
      <div style={{ padding: "2px" }}>
        {hasSegmentedData ? (
          <div>
            {/* RPE and Feedback Form */}
            <div>
              <h3>Rate Your Perceived Effort (RPE)</h3>
                
                {/* RPE Slider */}
                <div style={{ marginBottom: "15px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                    <span style={{ fontSize: "12px", color: "#666" }}>0</span>
                    <span style={{ fontSize: "14px", fontWeight: "bold" }}>RPE: {rpeValue}</span>
                    <span style={{ fontSize: "12px", color: "#666" }}>5</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    value={rpeValue}
                    onChange={(e) => setRpeValue(parseInt(e.target.value))}
                    style={{
                      width: "100%",
                      height: "6px",
                      borderRadius: "3px",
                      background: `linear-gradient(to right, #4caf50 0%, #4caf50 ${rpeValue * 20}%, #ddd ${rpeValue * 20}%, #ddd 100%)`,
                      outline: "none",
                      cursor: "pointer"
                    }}
                  />
                  <p style={{ fontSize: "12px", color: "#666", marginTop: "5px", textAlign: "center" }}>
                    {rpeDescriptions[rpeValue as keyof typeof rpeDescriptions]}
                  </p>
                </div>

                {/* Feedback Text Area */}
                <div style={{ marginBottom: "15px" }}>
                  <label style={{ display: "block", marginBottom: "5px", fontSize: "14px", fontWeight: "500" }}>
                    How did your session feel?
                  </label>
                  <textarea
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    placeholder="Tell us about your energy levels, any challenges you faced, what went well, and your overall experience..."
                    style={{
                      width: "100%",
                      minHeight: "80px",
                      padding: "10px",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      fontSize: "14px",
                      resize: "vertical",
                      fontFamily: "inherit"
                    }}
                  />
                </div>

                {/* Success Message */}
                {isSubmitted && (
                  <div style={{
                    marginBottom: "15px",
                    padding: "10px",
                    backgroundColor: "#d4edda",
                    border: "1px solid #c3e6cb",
                    borderRadius: "4px",
                    color: "#155724",
                    fontSize: "14px",
                    textAlign: "center"
                  }}>
                    ✓ Feedback submitted successfully! Your insights are being processed.
                  </div>
                )}

                {/* Send Button */}
                <button
                  onClick={handleSubmit}
                  disabled={isSubmitting || !feedbackText.trim() || isSubmitted}
                  style={{
                    width: "100%",
                    padding: "12px",
                    backgroundColor: isSubmitted ? "#28a745" : (isSubmitting || !feedbackText.trim() ? "#ccc" : "#2196f3"),
                    color: "white",
                    border: "none",
                    borderRadius: "4px",
                    fontSize: "14px",
                    fontWeight: "500",
                    cursor: (isSubmitting || !feedbackText.trim() || isSubmitted) ? "not-allowed" : "pointer",
                    transition: "background-color 0.2s"
                  }}
                >
                  {isSubmitted ? "✓ Feedback Submitted" : (isSubmitting ? "Sending..." : "Send Feedback")}
                </button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", color: "#666", fontStyle: "italic" }}>
              <p>No insights available yet. Complete a training session to get personalized feedback and analysis.</p>
            </div>
          )}
        </div>
      </div>
    );
  }