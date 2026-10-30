const db = require('./db');

async function getJourneySegment(trainId, fromStationId, toStationId, req) {
    if (!db.isMock()) {
        const rows = await db.query(
            `SELECT
                schedule.station_id, schedule.stop_sequence, route.distance_km
             FROM schedules schedule
             JOIN trains train ON train.train_id = schedule.train_id
             JOIN routes route ON route.route_id = train.route_id
             WHERE schedule.train_id = ?
             ORDER BY schedule.stop_sequence`,
            [trainId],
            req
        );
        if (!rows || rows.length < 2) return null;
        const origin = fromStationId
            ? rows.find(stop => stop.station_id === Number(fromStationId)) : rows[0];
        const destination = toStationId
            ? rows.find(stop => stop.station_id === Number(toStationId)) : rows[rows.length - 1];
        if (!origin || !destination || origin.stop_sequence >= destination.stop_sequence) return null;
        const stopSpan = rows[rows.length - 1].stop_sequence - rows[0].stop_sequence;
        if (stopSpan <= 0) return null;
        const fullDistance = Number(rows[0].distance_km);
        const distanceKm = fullDistance *
            (destination.stop_sequence - origin.stop_sequence) / stopSpan;
        return {
            start_sequence: origin.stop_sequence,
            end_sequence: destination.stop_sequence,
            full_distance_km: fullDistance,
            distance_km: distanceKm
        };
    }

    const stops = db.mockDb.schedules
        .filter(stop => stop.train_id === Number(trainId))
        .sort((a, b) => a.stop_sequence - b.stop_sequence);
    if (!stops.length) return null;
    const originId = fromStationId ? Number(fromStationId) : stops[0].station_id;
    const destinationId = toStationId ? Number(toStationId) : stops[stops.length - 1].station_id;
    const origin = stops.find(stop => stop.station_id === originId);
    const destination = stops.find(stop => stop.station_id === destinationId);
    if (!origin || !destination || origin.stop_sequence >= destination.stop_sequence) return null;

    const train = db.mockDb.trains.find(item => item.train_id === Number(trainId));
    const route = train && db.mockDb.routes.find(item => item.route_id === train.route_id);
    if (!route) return null;
    const stopSpan = stops[stops.length - 1].stop_sequence - stops[0].stop_sequence;
    if (stopSpan <= 0) return null;

    return {
        start_sequence: origin.stop_sequence,
        end_sequence: destination.stop_sequence,
        full_distance_km: Number(route.distance_km),
        distance_km: Number(route.distance_km) *
            (destination.stop_sequence - origin.stop_sequence) / stopSpan
    };
}

module.exports = { getJourneySegment };
