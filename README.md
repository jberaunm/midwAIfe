# Midwaife - Pregnancy Tracking Application

A comprehensive pregnancy tracking application with personalized meal planning, nutrition tracking, and an AI companion powered by LLMs.

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

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Multi-container orchestration

## Getting Started

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for local development)
- Python 3.10+ (for local development)
- PostgreSQL 15+ (if not using Docker)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd midwaife
   ```

2. **Set up environment variables**
   ```bash
   # Copy example env file
   cp .env.example .env

   # Edit .env and add your credentials
   nano .env
   ```

   Required variables:
   - `POSTGRES_PASSWORD` - Your PostgreSQL password
   - `ANTHROPIC_API_KEY` - Your Claude API key
   - `GOOGLE_API_KEY` - Your Google API key

3. **Start the application with Docker**
   ```bash
   docker-compose up -d
   ```

   This will start:
   - PostgreSQL database on port 5432
   - FastAPI backend on port 8000
   - Next.js frontend on port 3000

4. **Initialize the database**
   ```bash
   # Run migrations
   docker exec -i midwaife-db psql -U postgres -d midwaife < database/schema_postgresql_local.sql
   ```

5. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

### Local Development (without Docker)

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

## Security

⚠️ **Important Security Notes:**

1. **Never commit `.env` files** - They are in .gitignore for a reason
2. **Rotate credentials** before deploying to production
3. **Use strong passwords** for PostgreSQL
4. **Keep API keys secure** - Never expose in client-side code
5. **Review PRE_COMMIT_CHECKLIST.md** before committing

## Environment Variables

### Required
- `POSTGRES_PASSWORD` - Database password
- `ANTHROPIC_API_KEY` - Claude API key
- `GOOGLE_API_KEY` - Google API key

### Optional
- `POSTGRES_HOST` - Database host (default: localhost)
- `POSTGRES_PORT` - Database port (default: 5432)
- `POSTGRES_DATABASE` - Database name (default: midwaife)
- `POSTGRES_USER` - Database user (default: postgres)
- `NEXT_PUBLIC_API_URL` - Backend API URL (default: http://localhost:8000)

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

## Troubleshooting

### Database Connection Issues
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# View logs
docker logs midwaife-db

# Restart database
docker-compose restart postgres
```

### Frontend Not Loading
```bash
# Check frontend logs
docker logs midwaife-frontend

# Rebuild frontend
docker-compose up --build frontend
```

### API Key Errors
Ensure your `.env` file has valid API keys:
```bash
# Test Anthropic API key
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01"
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Before Committing
- Review `PRE_COMMIT_CHECKLIST.md`
- Ensure no credentials in code
- Test locally with Docker
- Update documentation if needed

## License

[Add your license here]

## Support

For issues and questions:
- Create an issue in GitHub
- Check existing documentation

## Acknowledgments

- Built with Claude Code (Anthropic)
- Powered by Claude AI
- Nutrition data sourced from USDA and pregnancy nutrition research
