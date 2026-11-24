import { KeyboardEvent } from 'react';
import { Badge, Text } from '@mantine/core';
import { IconBed } from '@tabler/icons-react';
import { LodgingRow } from '../utils/lodgingRows';
import classes from './LodgingSection.module.css';

interface LodgingSectionProps {
  rows: LodgingRow[];
  totalLabel: string;
  onOpen: (elementId: string) => void;
}

export function LodgingSection({ rows, totalLabel, onOpen }: LodgingSectionProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>, id: string) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(id);
    }
  };

  return (
    <section aria-label="Lodging" className={classes.section}>
      <div className={classes.band}>
        <Text fw={700} className={classes.bandTitle}>
          <IconBed size={16} aria-hidden /> Lodging ({rows.length})
        </Text>
        {totalLabel && <Text size="sm" c="dimmed">Total {totalLabel}</Text>}
      </div>

      <div className={`${classes.grid} ${classes.columns}`} aria-hidden>
        <span className={classes.name}>Hotel</span>
        <span className={classes.date}>Dates</span>
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
          <span className={classes.price}>{row.priceLabel}</span>
          <span className={classes.confirm}>{row.confirmation}</span>
          <span className={classes.badges}>
            {row.roomCount > 0 && (
              <Badge size="sm" variant="light" tt="none">
                {row.roomCount} {row.roomCount === 1 ? 'room' : 'rooms'}
              </Badge>
            )}
          </span>
          {(row.destination || row.deadline) && (
            <span className={classes.sub}>
              {row.destination && (
                <Badge size="sm" variant="light" tt="none" color={row.destination.color ?? 'gray'}>{row.destination.name}</Badge>
              )}
              {row.deadline && (
                <span className={classes.deadline} data-state={row.deadline.state}>{row.deadline.label}</span>
              )}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}
