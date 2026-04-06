/**
 * KNX GroupAddress XML Parser
 * 
 * Parses ETS XML exports to extract GroupAddress data for KNX Control
 */

export interface GroupAddress {
  address: string;    // GA format: "x/y/z" or numeric
  name: string;
  dpt: string;      // Data Point Type (e.g., "DPST-1-1")
  room?: string;      // Optional room/area
  functionType?: 'light' | 'blind' | 'scene' | 'sensor' | 'unknown';
  flags: {
    central: boolean;
    unfiltered: boolean;
  };
}

export interface GroupRange {
  name: string;
  startAddress: number;
  endAddress: number;
  addresses: GroupAddress[];
}

export interface ParsedExport {
  ranges: GroupRange[];
  totalAddresses: number;
}

/**
 * Parse ETS GroupAddress XML export
 */
export function parseKNXGroupAddressXML(xmlString: string): ParsedExport {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const groupRanges = doc.querySelectorAll('GroupRange');
  const ranges: GroupRange[] = [];
  
  groupRanges.forEach(range => {
    const addresses: GroupAddress[] = [];
    const addressNodes = range.querySelectorAll('GroupAddress');
    
    addressNodes.forEach(addr => {
      const address: GroupAddress = {
        address: addr.getAttribute('Address') || '',
        name: addr.getAttribute('Name') || '',
        dpt: addr.getAttribute('DPTs') || '',
        room: extractRoomFromName(addr.getAttribute('Name')),
        flags: {
          central: addr.getAttribute('Central') === 'true',
          unfiltered: addr.getAttribute('Unfiltered') === 'true'
        }
      };
      addresses.push(address);
    });
    
    ranges.push({
      name: range.getAttribute('Name') || '',
      startAddress: parseInt(range.getAttribute('RangeStart') || '0'),
      endAddress: parseInt(range.getAttribute('RangeEnd') || '0'),
      addresses
    });
  });
  
  return {
    ranges,
    totalAddresses: ranges.reduce((sum, r) => sum + r.addresses.length, 0)
  };
}

function extractRoomFromName(name: string): string {
  // Extract room from names like "Room: Function" or "Room - Function"
  const parts = name.split(':');
  if (parts.length >= 2) {
    return parts[0].trim();
  }
  // Check for "Room - Function" pattern
  const dashIndex = name.indexOf(' - ');
  if (dashIndex > 0) {
    return name.substring(0, dashIndex).trim();
  }
  return 'Unknown';
}

/**
 * Filter addresses by room and search query
 */
export function filterGroupAddresses(
  addresses: GroupAddress[],
  roomFilter: string,
  searchQuery: string
): GroupAddress[] {
  return addresses.filter(ga => {
    const matchesRoom = roomFilter === 'all' || ga.room === roomFilter;
    const matchesSearch = !searchQuery || ga.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRoom && matchesSearch;
  });
}

/**
 * Convert to internal GA format
 */
export function convertToInternalFormat(ga: GroupAddress): {
  address: string;
  name: string;
  dpt: string;
  room: string;
} {
  return {
    address: ga.address,
    name: ga.name,
    dpt: ga.dpt,
    room: ga.room
  };
}

// Main parser function
export function parseKNXExport(xmlContent: string): ParsedExport {
  try {
    const result = parseKNXGroupAddressXML(xmlContent);
    return {
      ranges: result.ranges,
      totalAddresses: result.totalAddresses,
      exportDate: new Date().toISOString(),
      parserVersion: '1.0.0'
    };
  } catch (error) {
    throw new Error(`XML parsing failed: ${error.message}`);
  }
}
