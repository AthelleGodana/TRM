import PageHeader from '../../components/layout/PageHeader';
import RideChooser from '../../components/rides/RideChooser';

// Students choose their usual pickup and drop-off (stop + time) and adjust
// single days.
export default function MyRides() {
  return (
    <div className="page max-w-4xl">
      <PageHeader title="My rides" subtitle="Your usual pickup and drop-off, and changes for particular days." />
      <RideChooser />
    </div>
  );
}
