import { useMemo } from 'react';

const useEventLayout = (events) => {
  return useMemo(() => {
    if (!events || events.length === 0) return [];

    // Sort events by start time
    const sortedEvents = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));

    // Group events that overlap in time
    const clusters = [];
    
    sortedEvents.forEach(event => {
      const eventStart = new Date(event.start);
      const eventEnd = new Date(event.end);
      
      // Find existing cluster that this event overlaps with
      let clusterFound = false;
      
      for (let cluster of clusters) {
        const overlapsWithCluster = cluster.some(clusterEvent => {
          const clusterStart = new Date(clusterEvent.start);
          const clusterEnd = new Date(clusterEvent.end);
          
          return (eventStart < clusterEnd && eventEnd > clusterStart);
        });
        
        if (overlapsWithCluster) {
          cluster.push(event);
          clusterFound = true;
          break;
        }
      }
      
      if (!clusterFound) {
        clusters.push([event]);
      }
    });

    // Process each cluster to determine positioning
    const finalLayout = [];
    
    clusters.forEach(cluster => {
      if (cluster.length === 1) {
        // Single event takes full width
        finalLayout.push({
          ...cluster[0],
          width: 95,
          left: 2.5,
          zIndex: 1
        });
      } else {
        // Multiple overlapping events - stagger them so titles are visible
        const baseWidth = 75; // Reduced width so events don't completely cover each other
        const offsetStep = 20; // Larger offset so you can see both event titles
        
        cluster.forEach((event, index) => {
          finalLayout.push({
            ...event,
            width: baseWidth,
            left: 2.5 + (index * offsetStep), // Larger stagger for title visibility
            zIndex: index + 1 // Higher z-index for later events
          });
        });
      }
    });

    return finalLayout;
  }, [events]);
};

export default useEventLayout; 