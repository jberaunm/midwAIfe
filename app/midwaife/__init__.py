"""
PM Assistant - Private Project Management Assistant

An AI-powered assistant for automated daily project reports and task management.
"""

__version__ = "1.0.0"

# Suppress logs and disable bytecode caching as early as possible
import os
import warnings

# CRITICAL: Disable bytecode caching FIRST to prevent stale .pyc files
os.environ["PYTHONDONTWRITEBYTECODE"] = "1"

warnings.filterwarnings("ignore")
os.environ["LITELLM_LOG"] = "ERROR"

# Lazy imports to avoid loading dependencies at package import time
# Use: from pm_assistant.agent import root_agent
# Instead of: from pm_assistant import agent