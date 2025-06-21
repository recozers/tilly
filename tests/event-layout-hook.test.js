// Event Layout Hook Tests
describe('useEventLayout Hook', () => {
  // Simulate the useEventLayout hook functionality for testing
  const useEventLayout = (events) => {
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
  };

  describe('Basic Functionality', () => {
    test('should return empty array for no events', () => {
      const result = useEventLayout([]);
      expect(result).toEqual([]);
    });

    test('should return empty array for null events', () => {
      const result = useEventLayout(null);
      expect(result).toEqual([]);
    });

    test('should handle single event', () => {
      const events = [{
        id: 1,
        title: 'Single Event',
        start: '2025-06-21T09:00:00Z',
        end: '2025-06-21T10:00:00Z'
      }];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        title: 'Single Event',
        width: 95,
        left: 2.5,
        zIndex: 1
      });
    });
  });

  describe('Event Sorting', () => {
    test('should sort events by start time', () => {
      const events = [
        {
          id: 2,
          title: 'Second Event',
          start: '2025-06-21T10:00:00Z',
          end: '2025-06-21T11:00:00Z'
        },
        {
          id: 1,
          title: 'First Event',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z'
        },
        {
          id: 3,
          title: 'Third Event',
          start: '2025-06-21T11:00:00Z',
          end: '2025-06-21T12:00:00Z'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result[0].id).toBe(1); // First by time
      expect(result[1].id).toBe(2); // Second by time
      expect(result[2].id).toBe(3); // Third by time
    });
  });

  describe('Non-overlapping Events', () => {
    test('should give full width to non-overlapping events', () => {
      const events = [
        {
          id: 1,
          title: 'Event 1',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z'
        },
        {
          id: 2,
          title: 'Event 2',
          start: '2025-06-21T11:00:00Z',
          end: '2025-06-21T12:00:00Z'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(2);
      result.forEach(event => {
        expect(event.width).toBe(95);
        expect(event.left).toBe(2.5);
        expect(event.zIndex).toBe(1);
      });
    });
  });

  describe('Overlapping Events', () => {
    test('should handle two overlapping events', () => {
      const events = [
        {
          id: 1,
          title: 'Event 1',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z'
        },
        {
          id: 2,
          title: 'Event 2',
          start: '2025-06-21T09:30:00Z',
          end: '2025-06-21T10:30:00Z'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(2);
      
      // First event (starts earlier)
      expect(result[0]).toMatchObject({
        id: 1,
        width: 75,
        left: 2.5,
        zIndex: 1
      });
      
      // Second event (starts later)
      expect(result[1]).toMatchObject({
        id: 2,
        width: 75,
        left: 22.5, // 2.5 + (1 * 20)
        zIndex: 2
      });
    });

    test('should handle three overlapping events', () => {
      const events = [
        {
          id: 1,
          title: 'Event 1',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T11:00:00Z'
        },
        {
          id: 2,
          title: 'Event 2',
          start: '2025-06-21T09:30:00Z',
          end: '2025-06-21T10:30:00Z'
        },
        {
          id: 3,
          title: 'Event 3',
          start: '2025-06-21T10:00:00Z',
          end: '2025-06-21T11:30:00Z'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(3);
      
      // All events should have reduced width
      result.forEach(event => {
        expect(event.width).toBe(75);
      });
      
      // Check positioning
      expect(result[0].left).toBe(2.5);     // First event
      expect(result[1].left).toBe(22.5);    // Second event (2.5 + 20)
      expect(result[2].left).toBe(42.5);    // Third event (2.5 + 40)
      
      // Check z-index
      expect(result[0].zIndex).toBe(1);
      expect(result[1].zIndex).toBe(2);
      expect(result[2].zIndex).toBe(3);
    });
  });

  describe('Complex Overlap Scenarios', () => {
    test('should handle multiple separate clusters', () => {
      const events = [
        // First cluster (overlapping)
        {
          id: 1,
          title: 'Event 1',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z'
        },
        {
          id: 2,
          title: 'Event 2',
          start: '2025-06-21T09:30:00Z',
          end: '2025-06-21T10:30:00Z'
        },
        // Second cluster (non-overlapping with first cluster)
        {
          id: 3,
          title: 'Event 3',
          start: '2025-06-21T14:00:00Z',
          end: '2025-06-21T15:00:00Z'
        },
        {
          id: 4,
          title: 'Event 4',
          start: '2025-06-21T14:30:00Z',
          end: '2025-06-21T15:30:00Z'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(4);
      
      // First cluster should have staggered layout
      const firstCluster = result.slice(0, 2);
      expect(firstCluster[0].width).toBe(75);
      expect(firstCluster[1].width).toBe(75);
      expect(firstCluster[0].left).toBe(2.5);
      expect(firstCluster[1].left).toBe(22.5);
      
      // Second cluster should also have staggered layout
      const secondCluster = result.slice(2, 4);
      expect(secondCluster[0].width).toBe(75);
      expect(secondCluster[1].width).toBe(75);
      expect(secondCluster[0].left).toBe(2.5);
      expect(secondCluster[1].left).toBe(22.5);
    });

    test('should handle partial overlaps correctly', () => {
      const events = [
        {
          id: 1,
          title: 'Event 1',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z'
        },
        {
          id: 2,
          title: 'Event 2',
          start: '2025-06-21T09:30:00Z',
          end: '2025-06-21T10:30:00Z'
        },
        {
          id: 3,
          title: 'Event 3',
          start: '2025-06-21T10:00:00Z', // Starts exactly when Event 1 ends
          end: '2025-06-21T11:00:00Z'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(3);
      
      // Events 1, 2, and 3 will all be in the same cluster because:
      // - Event 1 and 2 overlap
      // - Event 2 and 3 overlap (Event 2 ends at 10:30, Event 3 starts at 10:00)
      // This creates a chain where all events are connected
      const event1 = result.find(e => e.id === 1);
      const event2 = result.find(e => e.id === 2);
      const event3 = result.find(e => e.id === 3);
      
      // All events should have reduced width (all in same cluster)
      expect(event1.width).toBe(75);
      expect(event2.width).toBe(75);
      expect(event3.width).toBe(75);
      
      // Check positioning - all should be staggered
      expect(event1.left).toBe(2.5);    // First event
      expect(event2.left).toBe(22.5);   // Second event (2.5 + 20)
      expect(event3.left).toBe(42.5);   // Third event (2.5 + 40)
    });
  });

  describe('Edge Cases', () => {
    test('should handle events with same start and end times', () => {
      const events = [
        {
          id: 1,
          title: 'Event 1',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z'
        },
        {
          id: 2,
          title: 'Event 2',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(2);
      expect(result[0].width).toBe(75);
      expect(result[1].width).toBe(75);
      expect(result[0].left).toBe(2.5);
      expect(result[1].left).toBe(22.5);
    });

    test('should handle very short events', () => {
      const events = [
        {
          id: 1,
          title: 'Short Event',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T09:15:00Z' // 15 minute event
        }
      ];

      const result = useEventLayout(events);
      
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 1,
        width: 95,
        left: 2.5,
        zIndex: 1
      });
    });

    test('should preserve all original event properties', () => {
      const events = [
        {
          id: 1,
          title: 'Test Event',
          start: '2025-06-21T09:00:00Z',
          end: '2025-06-21T10:00:00Z',
          color: '#FF0000',
          description: 'Test description',
          customProperty: 'custom value'
        }
      ];

      const result = useEventLayout(events);
      
      expect(result[0]).toMatchObject({
        id: 1,
        title: 'Test Event',
        start: '2025-06-21T09:00:00Z',
        end: '2025-06-21T10:00:00Z',
        color: '#FF0000',
        description: 'Test description',
        customProperty: 'custom value',
        width: 95,
        left: 2.5,
        zIndex: 1
      });
    });
  });

  describe('Performance Considerations', () => {
    test('should handle large number of non-overlapping events efficiently', () => {
      const events = [];
      for (let i = 0; i < 100; i++) {
        events.push({
          id: i,
          title: `Event ${i}`,
          start: `2025-06-21T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}:00Z`,
          end: `2025-06-21T${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15 + 10).padStart(2, '0')}:00Z`
        });
      }

      const start = performance.now();
      const result = useEventLayout(events);
      const end = performance.now();
      
      expect(result).toHaveLength(100);
      expect(end - start).toBeLessThan(100); // Should complete in less than 100ms
      
      // All should have full width since they don't overlap
      result.forEach(event => {
        expect(event.width).toBe(95);
        expect(event.left).toBe(2.5);
      });
    });
  });
}); 