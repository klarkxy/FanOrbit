// Uncompressed ZIP writer. Slice JPEGs are already compressed; this only
// packs local files. No third-party library.
var FanOrbitZip = (function () {
  var CRC_TABLE = null;

  function table() {
    if (CRC_TABLE) return CRC_TABLE;
    CRC_TABLE = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      CRC_TABLE[n] = c >>> 0;
    }
    return CRC_TABLE;
  }

  function crc32(bytes) {
    var crc = 0xffffffff;
    var lut = table();
    for (var i = 0; i < bytes.length; i++) crc = lut[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function u16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function u32(view, offset, value) {
    view.setUint32(offset, value, true);
  }

  function encode(files) {
    var encoded = files.map(function (file) {
      var name = new TextEncoder().encode(String(file.name).replace(/\\/g, '/'));
      var data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
      return { name: name, data: data, crc: crc32(data) };
    });
    var localSize = 0;
    encoded.forEach(function (file) { localSize += 30 + file.name.length + file.data.length; });
    var centralSize = 0;
    encoded.forEach(function (file) { centralSize += 46 + file.name.length; });
    var out = new Uint8Array(localSize + centralSize + 22);
    var view = new DataView(out.buffer);
    var offset = 0;
    var locals = [];
    encoded.forEach(function (file) {
      locals.push(offset);
      u32(view, offset, 0x04034b50);
      u16(view, offset + 4, 20);
      u16(view, offset + 6, 0);
      u16(view, offset + 8, 0);
      u16(view, offset + 10, 0);
      u16(view, offset + 12, 0);
      u32(view, offset + 14, file.crc);
      u32(view, offset + 18, file.data.length);
      u32(view, offset + 22, file.data.length);
      u16(view, offset + 26, file.name.length);
      u16(view, offset + 28, 0);
      out.set(file.name, offset + 30);
      out.set(file.data, offset + 30 + file.name.length);
      offset += 30 + file.name.length + file.data.length;
    });
    var centralStart = offset;
    encoded.forEach(function (file, index) {
      u32(view, offset, 0x02014b50);
      u16(view, offset + 4, 20);
      u16(view, offset + 6, 20);
      u16(view, offset + 8, 0);
      u16(view, offset + 10, 0);
      u16(view, offset + 12, 0);
      u16(view, offset + 14, 0);
      u32(view, offset + 16, file.crc);
      u32(view, offset + 20, file.data.length);
      u32(view, offset + 24, file.data.length);
      u16(view, offset + 28, file.name.length);
      u16(view, offset + 30, 0);
      u16(view, offset + 32, 0);
      u16(view, offset + 34, 0);
      u16(view, offset + 36, 0);
      u32(view, offset + 38, 0);
      u32(view, offset + 42, locals[index]);
      out.set(file.name, offset + 46);
      offset += 46 + file.name.length;
    });
    u32(view, offset, 0x06054b50);
    u16(view, offset + 4, 0);
    u16(view, offset + 6, 0);
    u16(view, offset + 8, encoded.length);
    u16(view, offset + 10, encoded.length);
    u32(view, offset + 12, offset - centralStart);
    u32(view, offset + 16, centralStart);
    u16(view, offset + 20, 0);
    return out;
  }

  return { crc32: crc32, encode: encode };
})();
