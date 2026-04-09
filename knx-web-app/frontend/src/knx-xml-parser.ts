function getParserError(doc: Document) {
  const parserError = doc.querySelector('parsererror');
  return parserError ? parserError.textContent || 'Invalid XML document.' : null;
}

function extractRoomFromName(name: string) {
  if (!name) return '';

  const colonParts = name.split(':');
  if (colonParts.length >= 2 && colonParts[0].trim()) {
    return colonParts[0].trim();
  }

  const dashIndex = name.indexOf(' - ');
  if (dashIndex > 0) {
    return name.slice(0, dashIndex).trim();
  }

  return '';
}

function inferFunctionType(name: string, dpt: string) {
  const normalizedName = (name || '').toLowerCase();
  const normalizedDpt = (dpt || '').toLowerCase();

  if (normalizedDpt.includes('17.') || normalizedDpt.includes('17-')) return 'scene';
  if (normalizedDpt.includes('1.') || normalizedDpt.includes('1-')) return 'switch';
  if (normalizedDpt.includes('5.001') || normalizedDpt.includes('5-1')) return 'percentage';
  if (/(jalousie|blind|shade|shutter|rollladen)/.test(normalizedName)) return 'percentage';
  if (/(scene|szene)/.test(normalizedName)) return 'scene';
  if (/(switch|light|licht|on\/off|ein\/aus)/.test(normalizedName)) return 'switch';

  return null;
}

export interface ImportedGroupAddress {
  id: string;
  address: string;
  name: string;
  dpt: string;
  room: string;
  rangePath: string[];
  functionType: 'switch' | 'percentage' | 'scene' | null;
  supported: boolean;
}

export function parseKNXGroupAddressXML(xmlString: string): ImportedGroupAddress[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'application/xml');
  const parserError = getParserError(doc);

  if (parserError) {
    throw new Error(parserError);
  }

  const nodes = Array.from(doc.getElementsByTagName('GroupAddress'));
  if (nodes.length === 0) {
    throw new Error('No GroupAddress nodes found in XML.');
  }

  return nodes.map((node, index) => {
    const rangePath: string[] = [];
    let parent = node.parentElement;

    while (parent) {
      if (parent.tagName === 'GroupRange') {
        const rangeName = (parent.getAttribute('Name') || '').trim();
        if (rangeName) rangePath.unshift(rangeName);
      }
      parent = parent.parentElement;
    }

    const name = (node.getAttribute('Name') || '').trim();
    const dpt = (node.getAttribute('DPTs') || node.getAttribute('DatapointType') || '').trim();
    const derivedRoom = extractRoomFromName(name);
    const fallbackRoom = rangePath[rangePath.length - 1] || rangePath[0] || 'Unknown';
    const functionType = inferFunctionType(name, dpt);

    return {
      id: `${node.getAttribute('Id') || node.getAttribute('Address') || 'ga'}-${index}`,
      address: (node.getAttribute('Address') || '').trim(),
      name: name || '(Unnamed Group Address)',
      dpt,
      room: derivedRoom || fallbackRoom,
      rangePath,
      functionType,
      supported: functionType !== null,
    };
  });
}
