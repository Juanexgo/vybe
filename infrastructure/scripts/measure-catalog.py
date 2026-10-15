"""Small, read-only local smoke benchmark; not a production capacity test."""
import concurrent.futures,json,os,statistics,time,urllib.request
base=os.environ.get('BENCHMARK_API_URL','http://127.0.0.1:8080').rstrip('/')
if not base.startswith(('http://127.0.0.1:','http://localhost:')):raise SystemExit('Use a local API for this smoke benchmark')
def request(_):
 start=time.perf_counter()
 with urllib.request.urlopen(base+'/api/catalog',timeout=5) as response:
  data=json.load(response)
 return (time.perf_counter()-start)*1000,data['total']
request(0)
with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:results=list(pool.map(request,range(100)))
times=sorted(r[0] for r in results)
print(json.dumps({'requests':len(times),'concurrency':5,'catalogTitles':results[0][1],'p50Ms':round(statistics.median(times),2),'p95Ms':round(times[94],2),'maxMs':round(max(times),2),'scope':'local warm catalog smoke test; not production capacity'},indent=2))
