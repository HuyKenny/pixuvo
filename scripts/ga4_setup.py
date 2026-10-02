#!/usr/bin/env python3
"""GA4 property setup for Pixuvo (idempotent): custom dimensions, play-time metric, key events,
data retention. Uses the service account in ~/.config/gsc/service-account.json, which needs the
"Editor" role on the property (Admin → Property access management).

    python3 scripts/ga4_setup.py            # apply
    python3 scripts/ga4_setup.py --check    # only show what is missing
"""
import base64, json, os, sys, time, urllib.error, urllib.parse, urllib.request
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

PROPERTY = 'properties/557170748'  # Pixuvo.com - GA4, stream G-XESJS34X9Z
API = 'https://analyticsadmin.googleapis.com/v1beta/'
DIMENSIONS = [  # event parameters sent by src/scripts/analytics.ts and player.ts
    ('game_slug', 'Game', 'Game URL slug'),
    ('game_title', 'Game title', 'Game name'),
    ('game_category', 'Game category', 'Primary category slug'),
    ('provider', 'Partner', 'Game distribution partner (GameMonetize, GamePix, Playgama)'),
    ('page_type', 'Page type', 'home, category, game, list, search, directory, info'),
    ('list_name', 'Clicked from list', 'Which list a game card was opened from'),
    ('filter_key', 'Filter', 'Category filter group'),
    ('filter_value', 'Filter value', 'Category filter option'),
    ('rating', 'Rating', 'like / dislike'),
    ('reason', 'Report reason', 'Problem report reason'),
]
METRICS = [('play_seconds', 'Play time', 'Seconds the game page was visible with the game running', 'SECONDS')]
KEY_EVENTS = ['game_start']


def token():
    key = json.load(open(os.path.expanduser('~/.config/gsc/service-account.json')))
    now = int(time.time())
    enc = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b'=')
    head, claim = enc({'alg': 'RS256', 'typ': 'JWT'}), enc({'iss': key['client_email'], 'scope': 'https://www.googleapis.com/auth/analytics.edit https://www.googleapis.com/auth/analytics.readonly', 'aud': 'https://oauth2.googleapis.com/token', 'iat': now, 'exp': now + 3600})
    pk = serialization.load_pem_private_key(key['private_key'].encode(), None)
    sig = base64.urlsafe_b64encode(pk.sign(head + b'.' + claim, padding.PKCS1v15(), hashes.SHA256())).rstrip(b'=')
    body = urllib.parse.urlencode({'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion': (head + b'.' + claim + b'.' + sig).decode()}).encode()
    return json.load(urllib.request.urlopen('https://oauth2.googleapis.com/token', body))['access_token']


TOKEN = token()


def call(method, path, body=None):
    req = urllib.request.Request(API + path, method=method, headers={'Authorization': 'Bearer ' + TOKEN, 'Content-Type': 'application/json'}, data=json.dumps(body).encode() if body is not None else None)
    try:
        return json.load(urllib.request.urlopen(req))
    except urllib.error.HTTPError as e:
        raise SystemExit(f'{method} {path}: HTTP {e.code} {json.load(e).get("error", {}).get("message")}')


def main():
    check = '--check' in sys.argv
    dims = {d['parameterName'] for d in call('GET', f'{PROPERTY}/customDimensions').get('customDimensions', [])}
    mets = {m['parameterName'] for m in call('GET', f'{PROPERTY}/customMetrics').get('customMetrics', [])}
    keys = {k['eventName'] for k in call('GET', f'{PROPERTY}/keyEvents').get('keyEvents', [])}
    for p, name, desc in DIMENSIONS:
        if p in dims:
            continue
        print('dimension', p, '(missing)' if check else '→ created')
        if not check:
            call('POST', f'{PROPERTY}/customDimensions', {'parameterName': p, 'displayName': name, 'description': desc, 'scope': 'EVENT'})
    for p, name, desc, unit in METRICS:
        if p in mets:
            continue
        print('metric', p, '(missing)' if check else '→ created')
        if not check:
            call('POST', f'{PROPERTY}/customMetrics', {'parameterName': p, 'displayName': name, 'description': desc, 'scope': 'EVENT', 'measurementUnit': unit})
    for e in KEY_EVENTS:
        if e in keys:
            continue
        print('key event', e, '(missing)' if check else '→ created')
        if not check:
            call('POST', f'{PROPERTY}/keyEvents', {'eventName': e, 'countingMethod': 'ONCE_PER_EVENT'})
    ret = call('GET', f'{PROPERTY}/dataRetentionSettings')
    if ret.get('eventDataRetention') != 'TWO_MONTHS' or ret.get('userDataRetention') != 'TWO_MONTHS':
        print('retention', ret.get('eventDataRetention'), ret.get('userDataRetention'), '(should be 2 months)' if check else '→ 2 months')
        if not check:
            call('PATCH', f'{PROPERTY}/dataRetentionSettings?updateMask=eventDataRetention,userDataRetention', {'eventDataRetention': 'TWO_MONTHS', 'userDataRetention': 'TWO_MONTHS', 'resetUserDataOnNewActivity': True})
    print('done' if not check else 'check finished')


if __name__ == '__main__':
    main()
