import os
from typing import Optional, List, Dict, Any
import psycopg2
from psycopg2 import pool
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    'host': os.getenv('POSTGRES_HOST', 'localhost'),
    'port': int(os.getenv('POSTGRES_PORT', 5432)),
    'database': os.getenv('POSTGRES_DATABASE', 'midwaife'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'postgres'),
}

# Create connection pool
connection_pool: Optional[pool.SimpleConnectionPool] = None

def get_pool():
    """Get or create the connection pool"""
    global connection_pool
    if connection_pool is None:
        connection_pool = pool.SimpleConnectionPool(
            1,  # minconn
            20,  # maxconn
            **DB_CONFIG
        )
    return connection_pool

def get_db_connection():
    """Get a connection from the pool"""
    pool_instance = get_pool()
    return pool_instance.getconn()

def return_db_connection(conn):
    """Return a connection to the pool"""
    pool_instance = get_pool()
    pool_instance.putconn(conn)

def execute_query(query: str, params: tuple = None, fetch_one: bool = False, fetch_all: bool = True):
    """
    Execute a query and return results

    Args:
        query: SQL query string
        params: Query parameters tuple
        fetch_one: Return single row
        fetch_all: Return all rows

    Returns:
        Query results as list of dicts or single dict
    """
    conn = None
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            cursor.execute(query, params)

            if fetch_one:
                result = cursor.fetchone()
                conn.commit()  # Commit for INSERT/UPDATE with RETURNING
                return dict(result) if result else None
            elif fetch_all:
                results = cursor.fetchall()
                conn.commit()  # Commit for any SELECT or INSERT/UPDATE with RETURNING
                return [dict(row) for row in results]
            else:
                conn.commit()
                return cursor.rowcount

    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            return_db_connection(conn)

def execute_transaction(queries: List[tuple]) -> int:
    """
    Execute multiple queries in a transaction

    Args:
        queries: List of (query, params) tuples

    Returns:
        Number of affected rows
    """
    conn = None
    try:
        conn = get_db_connection()
        conn.autocommit = False

        with conn.cursor(cursor_factory=RealDictCursor) as cursor:
            total_rows = 0
            for query, params in queries:
                cursor.execute(query, params)
                total_rows += cursor.rowcount

            conn.commit()
            return total_rows

    except Exception as e:
        if conn:
            conn.rollback()
        raise e
    finally:
        if conn:
            conn.autocommit = True
            return_db_connection(conn)

def close_pool():
    """Close all connections in the pool"""
    global connection_pool
    if connection_pool:
        connection_pool.closeall()
        connection_pool = None
