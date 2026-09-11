"""
Station roll call, step 2 of 2: render out/station_audit.json as the page
scientists get (TERC-70). Usage: python3 build_report.py → out/tahoe-station-roll-call.html
Edit extra_questions.html for the standing questions at the bottom.
"""
import json, html
import os
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('ROLL_CALL_OUT', os.path.join(HERE, 'out'))
d = json.load(open(os.path.join(OUT, 'station_audit.json')))
S = d['stations']
def status(s):
    if not s['records30d']: return ('never', 'No data in 30 days')
    a = s['age_hours'] or 0
    if a <= 2: return ('live', 'Reporting')
    if a <= 24: return ('delayed', 'Delayed')
    return ('silent', 'Silent')
GROUPS = [('nearshore_station', 'Nearshore stations', 'ns-station-range'), ('nasa_buoy', 'NASA buoys', 'nasa-tb'), ('met_station', 'USCG met station', 'met-uscg2020'), ('tc_homewood', 'Homewood TC', 'tc-homewood')]
counts = {'live': 0, 'delayed': 0, 'silent': 0, 'never': 0}
for s in S: counts[status(s)[0]] += 1
KEY_FIELDS = {
 'nearshore_station': [('LS_Temp_Avg', 'Water temp', '°C'), ('WaveHeight', 'Wave height', 'm'), ('LS_Turbidity_Avg', 'Turbidity', 'NTU'), ('LS_DO_Avg', 'Dissolved O₂', ''), ('Conductivity25C_Avg', 'Conductivity', 'mS/cm'), ('LS_Chlorophyll_Avg', 'Chlorophyll', 'µg/L')],
 'nasa_buoy': [('RBR_0p5_m', 'Water temp 0.5 m', '°C'), ('AirTemp_1', 'Air temp 1', '°C'), ('AirTemp_2', 'Air temp 2', '°C'), ('WindSpeed_1', 'Wind 1', 'm/s'), ('WindSpeed_2', 'Wind 2', 'm/s'), ('WindDir_1', 'Wind dir 1', '°')],
 'met_station': [('AirTemp_C', 'Air temp', '°C'), ('WaterTemp_C', 'Water temp', '°C'), ('WindSpd_ms', 'Wind', 'm/s'), ('WindSpdMax_ms', 'Gust', 'm/s'), ('WindDir_deg', 'Wind dir', '°'), ('RH_percent', 'Humidity', '%'), ('BP_mbar', 'Pressure', 'mbar'), ('Batt_V', 'Battery', 'V')],
 'tc_homewood': [],
}
def esc(v): return html.escape(str(v))
def spark(s):
    if not s.get('daily'): return '<span class="spark spark--none">no records</span>'
    days = s['daily']; W, H, bw = 240, 36, 8
    bars = []
    for i, dday in enumerate(days):
        n = dday['n']; h = 0 if n == 0 else max(2, round(H * min(n, 72) / 72))
        cls = 'ok' if n >= 60 else ('part' if n > 0 else 'zero')
        bars.append(f'<rect class="b {cls}" x="{i*bw}" y="{H-h}" width="{bw-2}" height="{h}"><title>{dday["day"]}: {n} readings</title></rect>')
    full = sum(1 for x in days if x['n'] >= 60); part = sum(1 for x in days if 0 < x['n'] < 60); zero = sum(1 for x in days if x['n'] == 0)
    return f'<svg class="spark" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img" aria-label="Readings per day over the last 30 days: {full} full days, {part} partial, {zero} with none"><line class="expect" x1="0" x2="{W}" y1="0.5" y2="0.5"/>{"".join(bars)}</svg>'
def latest_values(s):
    row = s.get('latest_row') or {}
    items = [(label, row.get(k), unit) for k, label, unit in KEY_FIELDS.get(s['family'], []) if k in row]
    if not items: return ''
    return '<dl class="vals">' + ''.join(f'<div><dt>{esc(l)}</dt><dd>{esc(v)}{(" " + esc(u)) if u else ""}</dd></div>' for l, v, u in items) + '</dl>'
def outages(s):
    o = s.get('outages') or []
    if not o: return '<p class="muted">No silences longer than 2 hours in the last 30 days.</p>'
    li = ''.join(f'<li><span class="when">{esc(x["from_lake"])}</span> → <span class="when">{esc(x["to_lake"]) if x["to_lake"] else "now"}</span> <span class="dur">{x["hours"]:g} h{(" · ongoing") if x["ongoing"] else ""}</span></li>' for x in o)
    return f'<ul class="outages">{li}</ul>'
def row(s):
    st, label = status(s)
    newest = s['newest_lake'] or '—'
    age = f'{s["age_hours"]:g} h ago' if s['age_hours'] is not None else ''
    if s['age_hours'] and s['age_hours'] > 48: age = f'{s["age_hours"]/24:.1f} days ago'
    idtxt = f'#{s["id"]}' if s['id'] not in (None, -1) else 'no id'
    note = f'<p class="note">Registry note: {esc(s["note"])}</p>' if s.get('note') else ''
    apiname = s.get('api_station_name')
    name_line = f'API calls it <code>{esc(apiname)}</code>' if apiname else 'API returned no rows, so no name to compare'
    lv = latest_values(s)
    return f'''<article class="st st--{st}" id="{esc(s["endpoint"])}-{esc(s["id"])}">
  <header class="st-head"><h3>{esc(s["name"])} <span class="idc">{esc(s["endpoint"])} {idtxt}</span></h3><span class="chip chip--{st}">{label}</span></header>
  <div class="st-grid">
    <div class="st-when"><div class="big">{esc(newest)}</div><div class="muted">newest reading, lake time{(" · " + age) if age else ""}</div>
      <div class="muted small">{("Records in last 24 h: " + str(s["records24h"]) + " (expected ~72 at a 20-minute cadence)") if s["records24h"] is not None else "Records in last 30 days: 0"}</div></div>
    <div class="st-spark">{spark(s)}<div class="muted small">readings per day, last 30 days · line = 72/day</div></div>
  </div>
  <details><summary>Details, silences and the exact request</summary>
    {note}
    <p class="small">{name_line}. We asked for a 30-day window: <code class="url">{esc(s["request"])}</code> → HTTP {esc(s["http"])} in {s["seconds"]:g} s, {s["bytes"]:,} bytes, {s["records30d"] if s["records30d"] is not None else 0} records.</p>
    <h4>Silences longer than 2 hours (last 30 days)</h4>{outages(s)}
    {("<h4>Latest reading as reported</h4>" + lv) if lv else ""}
  </details>
</article>'''
sections = ''
for fam, title, ep in GROUPS:
    members = [s for s in S if s['family'] == fam]
    if members: sections += f'<section class="group"><h2>{title} <span class="ep">/{ep}</span></h2>' + ''.join(row(s) for s in members) + '</section>'
silent = [s for s in S if status(s)[0] == 'silent']; never = [s for s in S if status(s)[0] == 'never']
qs = ''.join(f'<li><strong>{esc(s["name"])}</strong> ({esc(s["endpoint"])} {("#" + str(s["id"])) if s["id"] not in (None, -1) else ""}) — last reading {esc(s["newest_lake"])}, silent for {s["age_hours"]/24:.1f} days. Is the station down, or is data not reaching the API?</li>' for s in silent)
qn = ''.join(f'<li><strong>{esc(s["name"])}</strong> ({esc(s["endpoint"])} {("#" + str(s["id"])) if s["id"] not in (None, -1) else ""}){(" — registry note: " + esc(s["note"])) if s.get("note") else ""}. Should the site expect data here at all, and if so, under which id?</li>' for s in never)
extra = open(os.path.join(HERE, 'extra_questions.html')).read() if os.path.exists(os.path.join(HERE, 'extra_questions.html')) else ''
css = open(os.path.join(HERE, 'report.css')).read()
page = f'''<title>Tahoe Station Roll Call</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,600;8..60,700&family=Source+Sans+3:wght@400;600&family=Source+Code+Pro:wght@400;500&display=swap">
<style>{css}</style>
<main>
<p class="eyebrow">Tahoe Environmental Research Center · report API audit</p>
<h1>Tahoe Station Roll Call</h1>
<p class="lede">What the public website received from every monitoring source on <strong>{esc(d["generated_lake"])} lake time</strong>, read straight from the report API the site uses. Please tell us where this differs from what the instruments are actually doing.</p>
<div class="summary">
  <div class="sum sum--live"><div class="n">{counts["live"]}</div><div class="l">Reporting (newest reading ≤ 2 h old)</div></div>
  <div class="sum sum--delayed"><div class="n">{counts["delayed"]}</div><div class="l">Delayed (2–24 h old)</div></div>
  <div class="sum sum--silent"><div class="n">{counts["silent"]}</div><div class="l">Silent (older than 24 h)</div></div>
  <div class="sum sum--never"><div class="n">{counts["never"]}</div><div class="l">No data in the last 30 days</div></div>
</div>
<p class="how">Every source was asked for its last 30 days (<code>rptdate</code> → <code>rptend</code>), one request at a time. Timestamps from the API are UTC and are shown here in lake time. Every source that returns anything reports every 20 minutes, so a full day is 72 readings; the dashed line on each chart marks that.</p>
{sections}
<section class="ask"><h2>Questions for the science team</h2><p class="muted">Answering these tells us whether to keep looking for a software problem or to stop.</p><ol>{qs}{qn}{extra}</ol></section>
<p class="foot">Method: {len(S)} requests to <code>https://tepfsail50.execute-api.us-west-2.amazonaws.com/v1/report</code>, sequential, 60-second timeout each. "Reporting / Delayed / Silent" is judged only by the age of the newest record the API returned; a source can be healthy at the lake and still show as silent here if data is not reaching the API. Generated {esc(d["generated_utc"])} UTC.</p>
</main>'''
open(os.path.join(OUT, 'tahoe-station-roll-call.html'), 'w').write(page)
print('written', len(page), 'bytes; counts', counts)
