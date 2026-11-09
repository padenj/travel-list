import { KeyboardEvent } from 'react';
import { Badge, Text } from '@mantine/core';
import { IconPlane } from '@tabler/icons-react';
import { FlightRow } from '../utils/flightRows';
import classes from './FlightsSection.module.css';

interface FlightsSectionProps {
  rows: FlightRow[];
  totalLabel: string;
  onOpen: (elementId: string) => void;
}

export function FlightsSection({ rows, totalLabel, onOpen }: FlightsSectionProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(id);
    }
  };

  return (
    <section aria-label="Flights" className={classes.section}>
      <div className={classes.band}>
        <Text fw={700} className={classes.bandTitle}>
          <IconPlane size={16} aria-hidden /> Flights ({rows.length})
        </Text>
        {totalLabel && (
          <Text size="sm" c="dimmed">
            Total {totalLabel}
          </Text>
        )}
      </div>

      <div className={`${classes.grid} ${classes.columns}`} aria-hidden>
        <span className={classes.name}>Flight</span>
        <span className={classes.date}>Date</span>
        <span className={classes.times}>Depart → Arrive</span>
        <span className={classes.price}>Price</span>
        <span className={classes.confirm}>Confirm #</span>
      </div>

      {rows.map((row, index) => (
        <div
          key={row.id}
          className={`${classes.grid} ${classes.row}`}
          data-tone={index % 2 === 0 ? 'a' : 'b'}
          role="button"
          tabIndex={0}
          aria-label={`Open ${row.name}`}
          onClick={() => onOpen(row.id)}
          onKeyDown={event => handleKeyDown(event, row.id)}
        >
          <span className={`${classes.name} ${classes.strong}`}>{row.name}</span>
          <span className={classes.date}>{row.dateLabel}</span>
          <span className={classes.price}>
            {row.priceLabel}
            {row.priceLabel && row.priceShared && <span className={classes.muted}> (shared)</span>}
          </span>
          <span className={classes.confirm}>{row.confirmation}</span>
          <span className={classes.badges}>
            {row.bookingCount > 0 && (
              <Badge size="sm" variant="light" tt="none">
                {row.bookingCount} {row.bookingCount === 1 ? 'booking' : 'bookings'}
              </Badge>
            )}
          </span>

          {row.legs.length === 0 && <span className={`${classes.note} ${classes.muted}`}>No legs yet</span>}

          {row.legs.map(leg => (
            <LegLines key={leg.id} leg={leg} />
          ))}
        </div>
      ))}
    </section>
  );
}

function LegLines({ leg }: { leg: FlightRow['legs'][number] }) {
  return (
    <>
      <span className={classes.legLabel}>{`${leg.label} ${leg.route}`.trim()}</span>
      <span className={classes.legTimes}>{leg.times}</span>
      {leg.layoverAfter && <span className={`${classes.note} ${classes.muted}`}>⏱ {leg.layoverAfter} layover</span>}
    </>
  );
}
