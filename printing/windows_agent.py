"""MWISHO Windows receipt-print agent. Requires Windows and pywin32.
Environment: MWISHO_URL, MWISHO_ANON_KEY, MWISHO_AGENT_EMAIL,
MWISHO_AGENT_PASSWORD, MWISHO_DEVICE_ID.
Use a dedicated, least-privileged Supabase Auth account assigned to this device.
"""
import json, os, time, urllib.request, urllib.error
import win32print

URL=os.environ["MWISHO_URL"].rstrip("/")
KEY=os.environ["MWISHO_ANON_KEY"]
EMAIL=os.environ["MWISHO_AGENT_EMAIL"]
PASSWORD=os.environ["MWISHO_AGENT_PASSWORD"]
DEVICE=os.environ["MWISHO_DEVICE_ID"]
token=None
expires=0

def request(path, body, auth=False):
    headers={"apikey":KEY,"Content-Type":"application/json"}
    if auth:
        headers["Authorization"]="Bearer "+token
    payload=json.dumps(body).encode()
    req=urllib.request.Request(URL+path,data=payload,headers=headers,method="POST")
    with urllib.request.urlopen(req,timeout=25) as resp:
        raw=resp.read().decode()\n        return json.loads(raw) if raw.strip() else None

def login():
    global token,expires
    data=request("/auth/v1/token?grant_type=password",{"email":EMAIL,"password":PASSWORD})
    token=data["access_token"]
    expires=time.time()+max(60,int(data.get("expires_in",3600))-120)

def line(text,width):
    return str(text).encode("ascii","replace")[:width]+b"\n"

def ticket(job):
    width=48 if job["paper_width_mm"]==80 else 32
    out=b"\x1b\x40"+b"\x1b\x61\x01"+line("MWISHO HOTEL",width)+b"\x1b\x61\x00"+line("ORDER #"+str(job["order_number"]),width)
    out+=line(job["destination"].upper()+" COPY",width)+line("Counter: "+job["counter_name"],width)
    out+=line("Table: "+job["table_label"],width)+b"-"*width+b"\n"
    for item in job["items"]:
        out+=line(str(item["quantity"])+" x "+item["name"],width)
        if item.get("choice"): out+=line("  "+item["choice"],width)
        if item.get("notes"): out+=line("  NOTE: "+item["notes"],width)
    out+=b"-"*width+b"\n\n\n"+b"\x1d\x56\x00"
    return out

def print_raw(printer_name,data):
    handle=win32print.OpenPrinter(printer_name)
    try:
        job=win32print.StartDocPrinter(handle,1,("MWISHO Hotel Ticket",None,"RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle,data)
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)

def main():
    global token
    while True:
        try:
            if not token or time.time()>expires:login()
            jobs=request("/rest/v1/rpc/claim_hotel_print_job",{"p_device":DEVICE},True)
            if jobs:
                job=jobs[0]
                try:
                    print_raw(job["windows_printer_name"],ticket(job))
                    request("/rest/v1/rpc/finish_hotel_print_job",{"p_job":job["job_id"],"p_success":True,"p_error":None},True)
                    print("Queued to Windows spooler:",job["order_number"],job["destination"],flush=True)
                except Exception as err:
                    print("Printer failure:",err,flush=True)
                    try:request("/rest/v1/rpc/finish_hotel_print_job",{"p_job":job["job_id"],"p_success":False,"p_error":str(err)[:500]},True)
                    except Exception as ack_err:print("Failure report error:",ack_err,flush=True)
            else:time.sleep(3)
        except KeyboardInterrupt:
            break
        except Exception as err:
            print("Connection error:",err,flush=True)
            token=None
            time.sleep(10)

if __name__=="__main__":main()
