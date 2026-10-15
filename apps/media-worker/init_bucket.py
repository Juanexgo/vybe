import time
from botocore.exceptions import ClientError
from worker import storage, BUCKET
s3=storage()
for attempt in range(30):
    try:
        try:s3.head_bucket(Bucket=BUCKET)
        except ClientError as error:
            if error.response['ResponseMetadata']['HTTPStatusCode']==404:s3.create_bucket(Bucket=BUCKET)
            else:raise
        print('Private media bucket ready.')
        break
    except Exception:
        if attempt==29:raise
        time.sleep(2)
