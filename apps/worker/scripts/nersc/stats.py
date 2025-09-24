import pandas as pd
from datetime import datetime
#
# sacct --format=JobID,QOS,Submit,Start,End > stats.txt
#
def parse_time(time_str):
    return datetime.strptime(time_str, '%Y-%m-%dT%H:%M:%S')

def format_timedelta(td):
    # Convert Timedelta to total seconds
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    seconds = total_seconds % 60
    return f"{hours:02}H:{minutes:02}m:{seconds:02}s"

def main():
    # Load the data
    data = pd.read_csv('stats.txt', delim_whitespace=True, header=0,
                       names=['JobID', 'QOS', 'Submit', 'Start', 'End'])
    
    # Filter rows where JobID is a pure number
    filtered_data = data[data['JobID'].str.contains('^\d+$', regex=True)].copy()
    
    # Calculate queue time and run time
    filtered_data.loc[:, 'Submit'] = filtered_data['Submit'].apply(parse_time)
    filtered_data.loc[:, 'Start'] = filtered_data['Start'].apply(parse_time)
    filtered_data.loc[:, 'End'] = filtered_data['End'].apply(parse_time)
    filtered_data.loc[:, 'QueueTime'] = filtered_data['Start'] - filtered_data['Submit']
    filtered_data.loc[:, 'RunTime'] = filtered_data['End'] - filtered_data['Start']
    
    # Format queue time and run time
    filtered_data.loc[:, 'QueueTime'] = filtered_data['QueueTime'].apply(format_timedelta)
    filtered_data.loc[:, 'RunTime'] = filtered_data['RunTime'].apply(format_timedelta)
    
    # Determine column widths
    job_id_width = max(len(str(job_id)) for job_id in filtered_data['JobID']) + 2
    qos_width = max(len(str(qos)) for qos in filtered_data['QOS']) + 2
    queue_time_width = max(len(str(queue_time)) for queue_time in filtered_data['QueueTime']) + 2
    run_time_width = max(len(str(run_time)) for run_time in filtered_data['RunTime']) + 2

    # Print header
    print(f"{'JobID'.ljust(job_id_width)}{'QOS'.ljust(qos_width)}{'Queue Time'.ljust(queue_time_width)}{'Run Time'.ljust(run_time_width)}")
    print('-' * (job_id_width + qos_width + queue_time_width + run_time_width))
    
    # Print results
    for index, row in filtered_data.iterrows():
        job_id = str(row['JobID']).ljust(job_id_width)
        qos = str(row['QOS']).ljust(qos_width)
        queue_time = row['QueueTime'].ljust(queue_time_width)
        run_time = row['RunTime'].ljust(run_time_width)
        print(f"{job_id}{qos}{queue_time}{run_time}")

if __name__ == "__main__":
    main()
