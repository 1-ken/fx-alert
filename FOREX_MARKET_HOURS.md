# FOREX_MARKET_HOURS.md

## Forex Market Operating Hours

FX Alert respects real-world forex market operating hours. Data streaming and alert monitoring only occur when the forex market is actively trading.

### Market Schedule (24/5)

The forex market operates **24 hours a day, 5 days a week**:
- **Opens**: Sunday 22:00 UTC
- **Closes**: Friday 22:00 UTC

Outside these hours, the market is closed for the weekend.

### Impact on FX Alert

#### When Market is Open (22:00 UTC Sunday - 22:00 UTC Friday)
- ✅ Real-time price data streams to your dashboard
- ✅ Alerts are actively monitored and triggered
- ✅ WebSocket connections are maintained
- ✅ Stream health metrics are updated continuously

#### When Market is Closed (22:00 UTC Friday - 22:00 UTC Sunday)
- ⏸️ Price data stream is paused
- ⏸️ Alerts are held and not triggered
- ⏸️ WebSocket may close or enter low-power mode
- ⚠️ "Market Closed" status shown in the UI

### Checking Market Status

The frontend checks market status in two ways:

1. **Via Snapshot Response**: The `/snapshot` endpoint returns a `market_status` field
   ```json
   {
     "market_status": "open",
     "pairs": { ... },
     "ts": "2026-03-19T22:30:00+00:00"
   }
   ```

2. **Via Stream Health**: The `/stream-health` endpoint indicates if data is flowing

### UI Indicators

When market is closed:
- Dashboard shows "Market Closed" badge
- Price updates are paused
- Alerts display as "pending monitoring" until market reopens
- Historical data remains viewable

### Backend Configuration

The backend enforces market hours strictly:
- Configured in backend `config.json`
- Cleanup tasks run at market open (Sun 22:00 UTC)
- Historical data retention: 14 calendar days
- Data older than 14 days is automatically deleted

### Time Zones

All times in FX Alert are in **UTC**. If you need to convert:
- **EST (US Eastern)**: UTC - 5 hours
- **GMT (London)**: UTC ± 0 hours
- **JST (Tokyo)**: UTC + 9 hours
- **AEST (Sydney)**: UTC + 10 hours

### Example

If you set an alert for EUR/USD to trigger at 1.1500:
- **Friday 20:00 UTC**: Market still open, alert monitored ✅
- **Friday 23:00 UTC**: Market closed, alert held 🛑
- **Sunday 22:00 UTC**: Market reopens, alert monitoring resumes ✅

### Frequently Asked Questions

**Q: Can I set alerts during market closed hours?**  
A: Yes! Alerts can be created anytime, but they only trigger when the market is open.

**Q: What happens to my alerts on weekends?**  
A: Alerts remain active but are not monitored. They resume automatically when the market opens Sunday at 22:00 UTC.

**Q: How is market status determined?**  
A: The backend calculates it based on current UTC time and the 24/5 schedule. The `market_status` field in API responses reflects this.

**Q: Can I view historical data when market is closed?**  
A: Yes! Historical data and chart views are always available, regardless of market status.
