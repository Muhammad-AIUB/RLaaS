import { resolveClientIp, trustedProxyHops } from './client-ip.util';

const SOCKET = '203.0.113.1';

describe('resolveClientIp', () => {
  describe('with no trusted proxies (the default)', () => {
    it('uses the socket address and ignores the header entirely', () => {
      expect(resolveClientIp(SOCKET, '198.51.100.9', 0)).toBe(SOCKET);
    });

    it('cannot be moved by any header value a client sends', () => {
      const attempts = [
        '1.2.3.4',
        '1.2.3.4, 5.6.7.8',
        ['1.2.3.4', '5.6.7.8'],
        '',
        '   ',
      ];

      for (const header of attempts) {
        expect(resolveClientIp(SOCKET, header, 0)).toBe(SOCKET);
      }
    });
  });

  describe('behind one trusted proxy (the Render shape)', () => {
    it('takes the rightmost entry, which the proxy itself wrote', () => {
      // The proxy appended what it saw: 198.51.100.9.
      expect(resolveClientIp(SOCKET, '198.51.100.9', 1)).toBe('198.51.100.9');
    });

    /**
     * The defect this whole module exists for. The old code took entry[0].
     * Every common proxy appends, so a client that sends its own
     * `x-forwarded-for` keeps the leftmost slot.
     */
    it('ignores a value the client injected ahead of the proxy', () => {
      const spoofed = '10.0.0.1, 198.51.100.9';

      expect(resolveClientIp(SOCKET, spoofed, 1)).toBe('198.51.100.9');
      expect(resolveClientIp(SOCKET, spoofed, 1)).not.toBe('10.0.0.1');
    });

    it('is not fooled by a long injected chain', () => {
      const spoofed = '1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.9';

      expect(resolveClientIp(SOCKET, spoofed, 1)).toBe('198.51.100.9');
    });

    it('reads repeated headers as one ordered chain', () => {
      expect(resolveClientIp(SOCKET, ['10.0.0.1', '198.51.100.9'], 1)).toBe(
        '198.51.100.9',
      );
    });
  });

  describe('behind two trusted proxies', () => {
    it('counts in from the right by the hop count', () => {
      // client, edge, inner -> with 2 hops the client is 2nd from the right.
      expect(resolveClientIp(SOCKET, '198.51.100.9, 10.0.0.2', 2)).toBe(
        '198.51.100.9',
      );
    });

    it('still discards anything left of the trust boundary', () => {
      expect(
        resolveClientIp(SOCKET, '1.1.1.1, 198.51.100.9, 10.0.0.2', 2),
      ).toBe('198.51.100.9');
    });
  });

  describe('when the header is shorter than the configured hop count', () => {
    it('falls back to the socket rather than picking an attacker entry', () => {
      // Claims 2 proxies, header has 1 entry: the deployment is misconfigured
      // or the request did not arrive through the expected path.
      expect(resolveClientIp(SOCKET, '1.2.3.4', 2)).toBe(SOCKET);
    });

    it('falls back when the header is absent', () => {
      expect(resolveClientIp(SOCKET, undefined, 1)).toBe(SOCKET);
    });
  });

  it('reports a placeholder when there is no socket address either', () => {
    expect(resolveClientIp(undefined, undefined, 0)).toBe('unknown');
  });
});

describe('trustedProxyHops', () => {
  it('defaults to trusting nothing', () => {
    expect(trustedProxyHops({})).toBe(0);
  });

  it('reads a configured hop count', () => {
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: '1' })).toBe(1);
    expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: '2' })).toBe(2);
  });

  it('treats junk and negative values as no trust', () => {
    for (const value of ['', 'yes', '-1', 'NaN', 'null']) {
      expect(trustedProxyHops({ TRUSTED_PROXY_HOPS: value })).toBe(0);
    }
  });
});
