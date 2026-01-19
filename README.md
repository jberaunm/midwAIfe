# Midwaife - Pregnancy Tracking Application

A comprehensive pregnancy tracking application with personalized meal planning, nutrition tracking, and an AI companion powered by LLMs.

<img width="1893" height="791" alt="image" src="https://github.com/user-attachments/assets/55b31288-30cd-4a41-8855-7029997ad249" />

## Features

### 🍎 Meal Planning
- Weekly meal planner with breakfast, lunch, dinner, and snacks
- "Eat the Rainbow" tracking with visual progress
- Daily nutrient summary
- Food safety warnings for pregnancy - UK NHS compliant.
- Drag-and-drop interface for easy meal management

### 🤖 AI Companion
- Conversational AI assistant powered by LLMs.
- Natural language food and meal logging
- Sleep and symptom tracking via conversation
- Personalized pregnancy advice and milestone information
- Context-aware responses based on your pregnancy week

### 📊 Health Tracking
- Sleep hours and quality logging
- Symptom tracking (nausea, fatigue, etc.)
- Daily health summaries
- Visual indicators integrated into meal planner

### 🎨 User Experience
- Light/Dark mode toggle
- Responsive design
- Real-time updates
- Intuitive drag-and-drop interactions

## Tech Stack

### Backend
- **FastAPI** - Modern Python web framework
- **PostgreSQL** - Primary database
- **Google ADK** - AI agent framework
- **Claude API** (Anthropic) - AI conversation engine

### Frontend
- **Next.js 15** - React framework
- **TypeScript** - Type-safe JavaScript
- **CSS Variables** - Theme system

### Local Development

#### Backend
```bash
cd app
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

#### Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local with your settings
npm run dev
```

## Project Structure

```
midwaife/
├── app/                      # FastAPI backend
│   ├── main.py              # Application entry point
│   ├── db/                  # Database connections and migrations
│   ├── meals/               # Meal planning routes and services
│   ├── users/               # User management
│   ├── daily_logs/          # Sleep and symptom tracking
│   └── midwaife/            # AI agent implementation
│       ├── agent.py         # Claude agent configuration
│       └── tools/           # AI agent tools
├── frontend/                # Next.js frontend
│   ├── src/
│   │   ├── app/
│   │   │   ├── components/  # React components
│   │   │   ├── context/     # React context (theme)
│   │   │   ├── lib/         # API client and utilities
│   │   │   └── globals.css  # Global styles
│   └── package.json
├── database/                # Database schemas and migrations
│   ├── schema_postgresql_local.sql
│   └── migrations/
├── docker-compose.yml       # Docker orchestration
├── .env.example            # Environment variables template
└── README.md               # This file
```

## API Endpoints

### Meals
- `GET /api/meals/foods` - List all foods
- `GET /api/meals/foods?q={query}` - Search foods
- `POST /api/meals/upsert` - Create/update meal
- `DELETE /api/meals/{meal_id}` - Delete meal

### Daily Logs
- `GET /api/daily-logs/{user_id}/{date}` - Get daily log
- `POST /api/daily-logs/upsert` - Create/update daily log
- `DELETE /api/daily-logs/{user_id}/{date}` - Delete daily log

### AI Agent
- `POST /api/agent/chat` - Send message to AI companion
- `GET /api/agent/greeting/{user_id}` - Get daily greeting
- `GET /api/agent/messages/{user_id}` - Get conversation history

## Database Schema

### Main Tables
- `users` - User profiles and pregnancy information
- `foods` - Food database with nutritional info
- `nutrients` - Nutrient definitions
- `food_nutrients` - Food-nutrient relationships
- `meals` - User meals
- `meal_items` - Meal-food relationships
- `daily_logs` - Sleep and symptom tracking
- `chat_messages` - AI conversation history

## Environment Variables

### Required
- `ANTHROPIC_API_KEY` - Claude API key

## Features in Detail

### AI Agent Tools
The AI companion has access to specialized tools:
- `get_user_info_tool` - Retrieve user profile and pregnancy week
- `get_current_week_meals_tool` - View current meal plan
- `get_rainbow_summary_tool` - Check rainbow color consumption
- `log_sleep_tool` - Log sleep data from conversation
- `log_symptoms_tool` - Log symptoms from conversation
- `get_daily_log_tool` - Retrieve health logs

### Meal Planning
- Supports 5 meal types: breakfast, lunch, dinner, snacks, supplements
- Automatic nutrient aggregation per day
- Rainbow color tracking (5 color categories)
- Food safety indicators for pregnancy
- Weekly milestones and nutrition tips

### Dark Mode
- System preference detection
- Manual toggle with persistent storage
- Smooth theme transitions
- Accessible contrast ratios

## Acknowledgments

- Built with Claude Code (Anthropic)
- Powered by Claude AI
- Nutrition data sourced from USDA and pregnancy nutrition research
