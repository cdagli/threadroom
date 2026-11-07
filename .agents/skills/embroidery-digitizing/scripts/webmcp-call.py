#!/usr/bin/env python3
"""Invoke one authorized Threadroom WebMCP tool in a named agent-browser session.

Examples:
  python3 webmcp-call.py --session cat get_design --output /tmp/design.json
  python3 webmcp-call.py --session cat capture_preview \
    --args '{"mode":"stitches","includeImages":true}' --output /tmp/preview.png
  python3 webmcp-call.py --session cat load_project --args @args.json \
    --restore-images-from full-backup.json --validate-only

Read the selected tool's schema first. This helper grants no additional authorization.
"""
import argparse
import base64
import json
from pathlib import Path
import subprocess
import sys
import tempfile


def read_json(value):
    return json.loads(Path(value[1:]).read_text() if value.startswith('@') else value)


def prepare_load(args, backup=None):
    """Reject geometry snapshots whose abbreviated image URLs cannot round-trip."""
    project = args.get('project')
    if isinstance(project, str):
        project = json.loads(project)
        args['project'] = project
    if not isinstance(project, dict):
        raise ValueError('load_project requires a project object or JSON string.')
    sources = {i['id']: i.get('src', '') for i in (backup or {}).get('images', [])}
    for image in project.get('images', []):
        src = image.get('src', '')
        if src.endswith(('…', '...')):
            src = sources.get(image.get('id'), '')
            if not src or src.endswith(('…', '...')):
                raise ValueError('Abbreviated image src: use a full downloaded project or '
                                 '--restore-images-from a full backup. The read-only JSON '
                                 'export is not a round-trip backup.')
            image['src'] = src
    return args


def invoke(session, tool, args):
    encoded = json.dumps(args)
    with tempfile.TemporaryDirectory(prefix='threadroom-webmcp-') as folder:
        if len(encoded.encode()) <= 1_048_576:
            path = Path(folder) / 'args.json'
            path.write_text(encoded)
            command = ['agent-browser', '--session', session, 'webmcp', 'invoke',
                       tool, '--params', '@' + str(path), '--json']
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            key = 'output'
        else:
            # The CLI's @file limit is 1 MiB; use the documented native API for full projects.
            js = ('(async()=>{const ts=await document.modelContext.getTools();'
                  'const t=ts.find(t=>t.name===' + json.dumps(tool) + ');'
                  'if(!t)throw new Error("Unknown WebMCP tool");'
                  'return await document.modelContext.executeTool(t,' + encoded + ');})()')
            result = subprocess.run(['agent-browser', '--session', session, 'eval',
                                     '--stdin', '--json'], input=js, capture_output=True,
                                    text=True, check=False)
            key = 'result'
    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(result.stderr.strip() or 'agent-browser returned invalid JSON') from exc
    if not response.get('success'):
        raise RuntimeError(response.get('error', 'Browser invocation failed'))
    output = response['data'][key]
    if isinstance(output, str):
        output = json.loads(output)
    texts = [c['text'] for c in output.get('content', []) if c.get('type') == 'text']
    if output.get('isError'):
        raise RuntimeError('\n'.join(texts))
    text = texts[0] if texts else None
    try:
        payload = json.loads(text) if text is not None else None
    except (json.JSONDecodeError, TypeError):
        payload = text
    return payload, [c for c in output.get('content', []) if c.get('type') == 'image']


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--session', required=True)
    parser.add_argument('tool')
    parser.add_argument('--args', default='{}', help='JSON or @JSON-file')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--restore-images-from', type=Path)
    parser.add_argument('--validate-only', action='store_true', help='Validate load sources without invoking')
    options = parser.parse_args()
    args = read_json(options.args)
    if options.tool == 'load_project':
        backup = json.loads(options.restore_images_from.read_text()) if options.restore_images_from else None
        prepare_load(args, backup)
    if options.validate_only:
        print(json.dumps({'valid': True, 'invoked': False}))
        return
    payload, images = invoke(options.session, options.tool, args)
    if not options.output:
        if images or isinstance(payload, dict) and 'base64' in payload:
            raise ValueError('Use --output to save binary/image results without printing base64.')
        print(json.dumps(payload, ensure_ascii=False))
        return
    path = options.output
    path.parent.mkdir(parents=True, exist_ok=True)
    saved = []
    if isinstance(payload, dict) and 'base64' in payload:
        path.write_bytes(base64.b64decode(payload['base64'], validate=True))
        saved.append(str(path))
    elif len(images) == 1 and path.suffix.lower() == '.png':
        path.write_bytes(base64.b64decode(images[0]['data'], validate=True))
        saved.append(str(path))
    else:
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        saved.append(str(path))
        for index, item in enumerate(images, 1):
            image_path = path.with_name(path.stem + f'-image-{index}.png')
            image_path.write_bytes(base64.b64decode(item['data'], validate=True))
            saved.append(str(image_path))
    print(json.dumps({'saved': saved}, ensure_ascii=False))


if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
