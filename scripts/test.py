import datetime
import sys

# Get current date and time
now = datetime.datetime.now()

# Format the date and time
formatted_date_time = now.strftime("%Y-%m-%d %H:%M:%S")

# Get Python version
python_version = sys.version

# Print the date and time, and Python version
print(f"Current Date and Time: {formatted_date_time}")
print(f"Python Version: {python_version}")
