#!/usr/bin/env python3
"""What do kids play on Pixuvo? GA4 Data API report (service account, read-only).

    python3 scripts/ga4_report.py [--days 28] [--top 20]

Starts and play time per game, category and partner. Play time is the time the game page was
visible with the game running (event game_play, metric play_seconds) — the best proxy for
in-game ad revenue until partner revenue is imported.
"""
import argparse, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from ga4_setup import PROPERTY, TOKEN  # noqa: E402  (reuses the authenticated token)
import urllib.request

ap = argparse.ArgumentParser()
ap.add_argument('--days', type=int, default=28)
ap.add_argument('--top', type=int, default=20)
a = ap.parse_args()


def report(dim):
    body = {
        'dateRanges': [{'startDate': f'{a.days}daysAgo', 'endDate': 'yesterday'}],
        'dimensions': [{'name': f'customEvent:{dim}'}],
        'metrics': [{'name': 'eventCount'}, {'name': 'customEvent:play_seconds'}],
        'dimensionFilter': {'filter': {'fieldName': 'eventName', 'inListFilter': {'values': ['game_start', 'game_play']}}},
        'orderBys': [{'metric': {'metricName': 'customEvent:play_seconds'}, 'desc': True}],
        'limit': a.top,
    }
    req = urllib.request.Request(f'https://analyticsdata.googleapis.com/v1beta/{PROPERTY}:runReport', data=json.dumps(body).encode(), headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'})
    return json.load(urllib.request.urlopen(req)).get('rows', [])


for dim, title in [('provider', 'Partner'), ('game_category', 'Category'), ('game_slug', 'Game')]:
    print(f'\n== {title} (last {a.days} days): events (starts + play sessions), play minutes')
    for r in report(dim):
        name = r['dimensionValues'][0]['value']
        events, secs = r['metricValues'][0]['value'], float(r['metricValues'][1]['value'])
        print(f'  {name:<40} {events:>7}  {secs / 60:>9.1f} min')
