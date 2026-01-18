import chromadb
from chromadb.config import Settings
from pathlib import Path
import os
import json
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta

class ChromaService:
    def __init__(self):
        # Get the absolute path to the app directory
        APP_DIR = Path(__file__).parent.parent
        DB_DIR = APP_DIR / "data" / "chroma"
        
        # Create the database directory if it doesn't exist
        DB_DIR.mkdir(parents=True, exist_ok=True)
        
        # Initialize ChromaDB client
        self.client = chromadb.PersistentClient(
            path=str(DB_DIR),
            settings=Settings(
                anonymized_telemetry=False,
                allow_reset=True
                #is_persistent=True
            )
        )
        
        # Disable telemetry to avoid capture() error
        try:
            import chromadb.telemetry as telemetry_module
            telemetry_module.TelemetryClient = None
        except:
            pass
        
        # Create or get the main collection
        self.collection = self.client.get_or_create_collection(
            name="agent_memory",
            metadata={"description": "Memory storage for AI agents"}
        )
    
    def add_memory(self, 
                   text: str, 
                   metadata: Optional[Dict[str, Any]] = None,
                   embedding: Optional[List[float]] = None) -> str:
        """Add a new memory to the database"""
        if metadata is None:
            metadata = {}
            
        # Generate a unique ID for the memory
        memory_id = f"memory_{len(self.collection.get()['ids']) + 1}"
        
        # Add the memory to the collection
        self.collection.add(
            documents=[text],
            metadatas=[metadata],
            ids=[memory_id],
            embeddings=[embedding] if embedding else None
        )
        
        return memory_id
    
    def search_memories(self, 
                       query: str, 
                       n_results: int = 5,
                       where: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """Search for relevant memories"""
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where
        )
        
        # Format the results
        memories = []
        for i in range(len(results['ids'][0])):
            memory = {
                'id': results['ids'][0][i],
                'text': results['documents'][0][i],
                'metadata': results['metadatas'][0][i],
                'distance': results['distances'][0][i] if 'distances' in results else None
            }
            memories.append(memory)
            
        return memories
    
    def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific memory by ID"""
        try:
            result = self.collection.get(ids=[memory_id])
            if not result['ids']:
                return None
                
            return {
                'id': result['ids'][0],
                'text': result['documents'][0],
                'metadata': result['metadatas'][0]
            }
        except Exception:
            return None
    
    def delete_memory(self, memory_id: str) -> bool:
        """Delete a memory by ID"""
        try:
            self.collection.delete(ids=[memory_id])
            return True
        except Exception:
            return False

    def store_training_plan(self, sessions: List[Dict], metadata: Dict) -> str:
        """Store training plan sessions in ChromaDB.
        
        Args:
            sessions: List of session dictionaries
            metadata: Additional metadata for the plan
            
        Returns:
            str: Plan ID
        """
        try:
            # Generate unique IDs for each session
            ids = [f"session_{i:03d}" for i in range(1, len(sessions) + 1)]
            
            # Create document strings for each session
            documents = []
            for session in sessions:
                doc = f"Session planned for {session['date']}, {session['distance']} {session['type']}"
                if session.get('notes'):
                    doc += f", {session['notes']}"
                documents.append(doc)
            
            # Prepare metadata for each session with new structure
            metadatas = []
            for session in sessions:
                session_metadata = {
                    "date": session["date"],
                    "day": session["day"],
                    "type": session["type"],
                    "distance": session["distance"],
                    "notes": session.get("notes", ""),
                    # New fields with default empty values (serialized as JSON strings)
                    "calendar": json.dumps({
                        "events": []
                    }),
                    "weather": json.dumps({
                        "hours": []
                    }),
                    "time_scheduled": json.dumps([]),
                    "data_points": json.dumps({
                        "laps": []
                    }),
                    "session_completed": False
                }
                metadatas.append(session_metadata)
            
            # Add the sessions to the collection
            try:
                self.collection.add(
                    ids=ids,
                    documents=documents,
                    metadatas=metadatas
                )
                print(f"Successfully stored {len(sessions)} training plan sessions")
                return "success"
            except Exception as add_error:
                # Check if it's a telemetry error (non-critical)
                if "telemetry" in str(add_error).lower() or "capture()" in str(add_error):
                    print(f"ChromaDB telemetry warning (non-critical): {str(add_error)}")
                    # Still return success since the data was likely stored
                    return "success"
                else:
                    # Re-raise non-telemetry errors
                    raise add_error
            
        except Exception as e:
            print(f"Error storing training plan: {str(e)}")
            return str(e)
    
    def get_training_plan(self, plan_id: str) -> Dict:
        """Retrieve a training plan by ID."""
        try:
            results = self.collection.get(
                where={"plan_id": plan_id}
            )
            return results
        except Exception as e:
            print(f"Error retrieving training plan: {str(e)}")
            return None
        


    def update_session_calendar(self, session_id: str, calendar_events: List[Dict]) -> bool:
        """Update calendar events for a specific session.
        
        Args:
            session_id: The session ID to update
            calendar_events: List of calendar events
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get current session metadata
            result = self.collection.get(ids=[session_id])
            if not result['ids']:
                return False
            
            current_metadata = result['metadatas'][0]
            
            # Update calendar events
            current_metadata['calendar'] = json.dumps({
                "events": calendar_events
            })
            
            # Update the session
            self.collection.update(
                ids=[session_id],
                metadatas=[current_metadata]
            )
            
            return True
            
        except Exception as e:
            print(f"Error updating session calendar: {str(e)}")
            return False

    def update_session_weather(self, session_id: str, weather_data: Dict) -> bool:
        """Update weather data for a specific session.
        
        Args:
            session_id: The session ID to update
            weather_data: Weather data with hours array
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get current session metadata
            result = self.collection.get(ids=[session_id])
            if not result['ids']:
                return False
            
            current_metadata = result['metadatas'][0]
            
            # Update weather data
            current_metadata['weather'] = json.dumps(weather_data)
            
            # Update the session
            self.collection.update(
                ids=[session_id],
                metadatas=[current_metadata]
            )
            
            return True
            
        except Exception as e:
            print(f"Error updating session weather: {str(e)}")
            return False

    def update_session_time_scheduled(self, session_id: str, time_scheduled: List[Dict]) -> bool:
        """Update time scheduling for a specific session.
        
        Args:
            session_id: The session ID to update
            time_scheduled: List of scheduled time slots
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get current session metadata
            result = self.collection.get(ids=[session_id])
            if not result['ids']:
                return False
            
            current_metadata = result['metadatas'][0]
            
            # Update time scheduled
            current_metadata['time_scheduled'] = json.dumps(time_scheduled)
            
            # Update the session
            self.collection.update(
                ids=[session_id],
                metadatas=[current_metadata]
            )
            
            return True
            
        except Exception as e:
            print(f"Error updating session time scheduled: {str(e)}")
            return False

    def update_session_status(self, session_id: str, session_completed: bool) -> bool:
        """Update session completion status.
        
        Args:
            session_id: The session ID to update
            session_completed: Whether the session is completed
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get current session metadata
            result = self.collection.get(ids=[session_id])
            if not result['ids']:
                return False
            
            current_metadata = result['metadatas'][0]
            
            # Update session completion status
            current_metadata['session_completed'] = session_completed
            
            # Update the session
            self.collection.update(
                ids=[session_id],
                metadatas=[current_metadata]
            )
            
            return True
            
        except Exception as e:
            print(f"Error updating session status: {str(e)}")
            return False

    def update_session_metadata(self, session_id: str, updates: Dict) -> bool:
        """Update multiple metadata fields for a specific session.
        
        Args:
            session_id: The session ID to update
            updates: Dictionary of metadata fields to update
            
        Returns:
            bool: True if successful, False otherwise
        """
        try:
            # Get current session metadata
            result = self.collection.get(ids=[session_id])
            if not result['ids']:
                return False
            
            current_metadata = result['metadatas'][0]
            
            # Update the metadata with new values
            current_metadata.update(updates)
            
            # Update the session
            self.collection.update(
                ids=[session_id],
                metadatas=[current_metadata]
            )
            
            return True
            
        except Exception as e:
            print(f"Error updating session metadata: {str(e)}")
            return False

    def _deserialize_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """Helper method to deserialize JSON strings in metadata back to objects."""
        try:
            deserialized = metadata.copy()
            
            # Deserialize calendar events
            if 'calendar' in deserialized and isinstance(deserialized['calendar'], str):
                try:
                    deserialized['calendar'] = json.loads(deserialized['calendar'])
                except json.JSONDecodeError:
                    deserialized['calendar'] = {"events": []}
            
            # Deserialize weather data
            if 'weather' in deserialized and isinstance(deserialized['weather'], str):
                try:
                    deserialized['weather'] = json.loads(deserialized['weather'])
                except json.JSONDecodeError:
                    deserialized['weather'] = {"hours": []}
            
            # Deserialize time scheduled
            if 'time_scheduled' in deserialized and isinstance(deserialized['time_scheduled'], str):
                try:
                    deserialized['time_scheduled'] = json.loads(deserialized['time_scheduled'])
                except json.JSONDecodeError:
                    deserialized['time_scheduled'] = []
            
            # Deserialize data_points
            if 'data_points' in deserialized and isinstance(deserialized['data_points'], str):
                try:
                    deserialized['data_points'] = json.loads(deserialized['data_points'])
                except json.JSONDecodeError:
                    deserialized['data_points'] = {"laps": []}
            
            return deserialized
        except Exception as e:
            print(f"Error deserializing metadata: {str(e)}")
            return metadata

    def get_session_by_date(self, date: str) -> List[Dict]:
        """Get sessions from a specific date IN THE FORMAT YYYY-MM-DD"""
        try:
            results = self.collection.get(where={"date": date})
            
            # Deserialize JSON strings in metadata
            if results and 'metadatas' in results:
                for i, metadata in enumerate(results['metadatas']):
                    results['metadatas'][i] = self._deserialize_metadata(metadata)
            
            return results
        except Exception as e:
            print(f"Error retrieving today's sessions: {str(e)}")
            return []

    def get_weekly_sessions(self, start_date: str) -> Dict:
        """Get sessions for a week starting from the given date (Monday).
        
        Args:
            start_date: Start date in YYYY-MM-DD format (should be a Monday)
            
        Returns:
            Dict containing:
                - status: "success" or "error"
                - data: List of daily sessions for the week
                - summary: Weekly summary statistics
                - message: Description of the result
        """
        try:
            from datetime import datetime, timedelta
            
            # Validate start_date format
            try:
                start_dt = datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                return {
                    "status": "error",
                    "data": None,
                    "summary": None,
                    "message": "Invalid date format. Use YYYY-MM-DD"
                }
            
            days_since_monday = start_dt.weekday()

            # Calculate the Monday of the current week
            monday_dt = start_dt - timedelta(days=days_since_monday)

            # Calculate the Sunday of the current week (6 days after Monday)
            sunday_dt = monday_dt + timedelta(days=6)

            # Format the datetime objects back into 'YYYY-MM-%d' strings
            start_date_of_week = monday_dt.strftime("%Y-%m-%d")
            end_date_of_week = sunday_dt.strftime("%Y-%m-%d")
            
            # Get all sessions for the week by querying each day individually
            daily_sessions = {}
            
            for i in range(7):
                current_date = (monday_dt + timedelta(days=i)).strftime("%Y-%m-%d")
                
                # Get sessions for this specific date
                results = self.collection.get(
                    where={"date": current_date}
                )
                
                # Check if we have any results for this date
                if (results and 'ids' in results and results['ids'] and 
                    len(results['ids']) > 0):
                    
                    # Deserialize JSON strings in metadata
                    if 'metadatas' in results and results['metadatas'] and len(results['metadatas']) > 0:
                        for j, metadata in enumerate(results['metadatas']):
                            results['metadatas'][j] = self._deserialize_metadata(metadata)
                    
                    # Process the results for this date
                    for j in range(len(results['ids'])):
                        session_date = results['metadatas'][j].get('date', '')
                        daily_sessions[session_date] = {
                            'id': results['ids'][j],
                            'session': results['documents'][j],
                            'metadata': results['metadatas'][j]
                        }
            
            # Create a complete week structure (Monday to Sunday)
            week_data = []
            total_distance_planned = 0
            total_distance_completed = 0            
            total_sessions = 0
            completed_sessions = 0
            
            for i in range(7):
                current_date = (monday_dt + timedelta(days=i)).strftime("%Y-%m-%d")
                day_name = (monday_dt + timedelta(days=i)).strftime("%A")
                
                if current_date in daily_sessions:
                    session_data = daily_sessions[current_date]
                    metadata = session_data['metadata']
                    
                    # Extract session information
                    session_type = metadata.get('type', 'No Session')
                    actual_distance = metadata.get('actual_distance', 0)
                    planned_distance = metadata.get('distance', 0)
                    session_completed = metadata.get('session_completed', False)
                    
                    # Update totals
                    if session_type != 'Rest Day' and planned_distance > 0:
                        total_sessions += 1
                        total_distance_planned += planned_distance
                        total_distance_completed += actual_distance
                    
                    if session_completed:
                        completed_sessions += 1
                    
                    week_data.append({
                        'date': current_date,
                        'day_name': day_name,
                        'session_type': session_type,
                        'planned_distance': planned_distance,
                        'actual_distance': actual_distance,
                        'session_completed': session_completed,
                        'has_activity': session_type != 'Rest Day' and actual_distance > 0,
                        'is_today': current_date == datetime.now().strftime("%Y-%m-%d")
                    })
                else:
                    # No session data for this day
                    week_data.append({
                        'date': current_date,
                        'day_name': day_name,
                        'session_type': 'No Session',
                        'planned_distance': 0,
                        'actual_distance': 0,
                        'session_completed': False,
                        'has_activity': False,
                        'is_today': current_date == datetime.now().strftime("%Y-%m-%d")
                    })
            
            # Create weekly summary
            summary = {
                'total_distance_planned': total_distance_planned,
                'total_distance_completed': total_distance_completed,
                'total_sessions': total_sessions,
                'completed_sessions': completed_sessions,
                'completion_rate': (completed_sessions / total_sessions * 100) if total_sessions > 0 else 0,
                'week_start': start_date_of_week,
                'week_end': end_date_of_week
            }
            
            return {
                "status": "success",
                "data": week_data,
                "summary": summary,
                "message": f"Weekly data retrieved for {start_date_of_week} to {end_date_of_week}"
            }
            
        except Exception as e:
            print(f"Error in get_weekly_sessions: {str(e)}")
            return {
                "status": "error",
                "data": None,
                "summary": None,
                "message": f"Error retrieving weekly sessions: {str(e)}"
            }

    def get_upcoming_sessions(self, days: int = 7) -> List[Dict]:
        """Get sessions scheduled for the next n days."""
        try:
            today = datetime.now()
            end_date = (today + timedelta(days=days)).strftime("%Y-%m-%d")
            
            results = self.collection.query(
                where={
                    "date": {
                        "$gte": today.strftime("%Y-%m-%d"),
                        "$lte": end_date
                    }
                }
            )
            
            # Deserialize JSON strings in metadata
            if results and 'metadatas' in results and results['metadatas']:
                for i, metadata in enumerate(results['metadatas'][0]):
                    results['metadatas'][0][i] = self._deserialize_metadata(metadata)
            
            return results
        except Exception as e:
            print(f"Error retrieving upcoming sessions: {str(e)}")
            return []

    def list_all_sessions(self) -> Dict:
        """List all sessions stored in ChromaDB.
        
        Returns:
            Dict containing:
                - status: "success" or "error"
                - data: List of all sessions with their IDs, documents, and metadata
                - count: Total number of sessions
        """
        try:
            # Get all data from the collection
            results = self.collection.get()
            
            if not results:
                return {
                    "status": "success",
                    "data": [],
                    "count": 0,
                    "message": "No sessions found in ChromaDB"
                }
            
            # Format the results and deserialize metadata
            sessions = []
            for i in range(len(results['ids'])):
                metadata = self._deserialize_metadata(results['metadatas'][i])
                session = {
                    "id": results['ids'][i],
                    "document": results['documents'][i],
                    "metadata": metadata
                }
                sessions.append(session)
            
            return {
                "status": "success",
                "data": sessions,
                "count": len(sessions),
                "message": f"Found {len(sessions)} sessions in ChromaDB"
            }
            
        except Exception as e:
            return {
                "status": "error",
                "data": None,
                "count": 0,
                "message": f"Error listing sessions: {str(e)}"
            }

    def get_activity_by_id(self, activity_id: int) -> Dict:
        """
        Retrieves activity data by activity_id from the database.
        
        Args:
            activity_id: The Strava activity ID
            
        Returns:
            Dict containing:
                - status: "success" or "error"
                - message: Description of the result
                - activity_data: The activity data or None if not found
        """
        try:
            activity_id_str = str(activity_id)
            results = self.collection.get(ids=[activity_id_str])
            
            if not results['ids']:
                return {
                    "status": "error",
                    "message": f"No activity found with ID: {activity_id}",
                    "activity_data": None
                }
            
            # Reconstruct the activity data structure
            document = results['documents'][0]
            metadata = results['metadatas'][0]
            
            # Parse data_points separately to avoid duplication
            data_points = {}
            if metadata.get("data_points"):
                data_points = json.loads(metadata["data_points"])
                # Remove data_points from metadata to avoid duplication
                del metadata["data_points"]
            
            activity_data = {
                "activity_id": activity_id,
                "metadata": metadata,  # metadata without data_points
                "data_points": data_points  # data_points as separate field
            }
            
            return {
                "status": "success",
                "message": f"Found activity data for ID: {activity_id}",
                "activity_data": activity_data
            }
            
        except Exception as e:
            return {
                "status": "error",
                "message": f"Error retrieving activity data: {str(e)}",
                "activity_data": None
            }

# Create a singleton instance
chroma_service = ChromaService() 