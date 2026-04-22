import React, { useState, useEffect, useRef } from 'react';
import { Bell, ChevronRight, Home as HomeIcon, Menu, X, Check, Calendar, User, Stethoscope, Clock, MapPin, Building2, FileText } from 'lucide-react';
import { getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from './services/api';
import { supabase } from './services/supabaseClient';
import { getCurrentNotificationContext, matchesNotificationForContext } from './services/notificationAudience';
import Sidebar from './components/Sidebar';
import { useAppTheme } from './context/ThemeContext';

const buildNotificationContentKey = (notification) => {
  const title = String(notification?.title || '').trim().toLowerCase();
  const message = String(notification?.message || notification?.body || '').trim().toLowerCase();
  const type = String(notification?.type || '').trim().toLowerCase();
  const createdAt = String(notification?.created_at || '').trim();
  const createdAtSecond = createdAt ? createdAt.slice(0, 19) : '';
  return `${type}|${title}|${message}|${createdAtSecond}`;
};

const dedupeNotificationsByContent = (notifications) => {
  const seen = new Set();
  return notifications.filter((notification) => {
    const key = buildNotificationContentKey(notification);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const Notifications = ({ onNavigate }) => {
  const theme = useAppTheme();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedNotification, setSelectedNotification] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const channelRef = useRef(null);

  // Scroll locking only when sidebar is open (modal handles its own scroll)
  useEffect(() => {
    if (isMenuOpen) {
      const scrollY = window.scrollY;
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.touchAction = 'none';

      // Prevent scrolling
      const preventScroll = (e) => {
        if (e.type === 'wheel' || e.type === 'touchmove') {
          e.preventDefault();
        }
      };

      document.addEventListener('wheel', preventScroll, { passive: false });
      document.addEventListener('touchmove', preventScroll, { passive: false });

      return () => {
        document.removeEventListener('wheel', preventScroll);
        document.removeEventListener('touchmove', preventScroll);
      };
    } else {
      const scrollY = parseInt(document.body.style.top || '0') * -1;
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
      window.scrollTo(0, scrollY);
    }
    return () => {
      document.documentElement.style.overflow = 'unset';
      document.body.style.overflow = 'unset';
      document.body.style.position = 'unset';
      document.body.style.width = 'unset';
      document.body.style.top = 'unset';
      document.body.style.touchAction = 'auto';
    };
  }, [isMenuOpen]);

  // Load notifications on component mount and subscribe to realtime
  useEffect(() => {
    fetchNotifications();
    subscribeToNotifications();

    // âœ… NEW: Add event listeners for notification updates
    const handlePushNotificationArrived = () => {
      console.log('ðŸ“¬ Push notification arrived - Notifications page will refetch');
      fetchNotifications();
    };

    const handlePushNotificationClicked = () => {
      console.log('ðŸ”” Push notification clicked - Notifications page refetching');
      fetchNotifications();
    };

    const handleAppResumed = () => {
      console.log('ðŸ“± App resumed - Notifications page refetching');
      fetchNotifications();
    };

    window.addEventListener('pushNotificationArrived', handlePushNotificationArrived);
    window.addEventListener('pushNotificationClicked', handlePushNotificationClicked);
    window.addEventListener('appResumed', handleAppResumed);

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      window.removeEventListener('pushNotificationArrived', handlePushNotificationArrived);
      window.removeEventListener('pushNotificationClicked', handlePushNotificationClicked);
      window.removeEventListener('appResumed', handleAppResumed);
    };
  }, []);

  const subscribeToNotifications = () => {
    const notificationContext = getCurrentNotificationContext();
    if (!notificationContext.userId) return;

    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => {
          const newNotif = payload.new;
          const isForMe = matchesNotificationForContext(newNotif, notificationContext);
          if (isForMe) {
            setNotifications((prev) => dedupeNotificationsByContent([newNotif, ...prev]));
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
  };

  // Handle initial notification from sessionStorage
  useEffect(() => {
    const storedNotification = sessionStorage.getItem('initialNotification');
    if (storedNotification) {
      try {
        const notification = JSON.parse(storedNotification);
        if (notification) {
          // Process the notification
          handleNotificationClick(notification);
          // Remove from sessionStorage after processing
          sessionStorage.removeItem('initialNotification');
        }
      } catch (error) {
        console.error('Error parsing stored notification:', error);
      }
    }
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const response = await getUserNotifications();
      if (response.success) {
        setNotifications(response.data || []);
      } else {
        setError(response.message || 'Failed to fetch notifications');
      }
    } catch (err) {
      console.error('Error fetching notifications:', err);
      setError('Failed to fetch notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkAsRead = async (id) => {
    try {
      await markNotificationAsRead(id);
      // Update the notification locally
      setNotifications(prev =>
        prev.map(notif =>
          notif.id === id ? { ...notif, is_read: true } : notif
        )
      );
    } catch (err) {
      console.error('Error marking notification as read:', err);
    }
  };

  const handleNotificationClick = async (notification) => {
    try {
      // Mark as read when clicked
      if (!notification.is_read) {
        await markNotificationAsRead(notification.id);
        setNotifications(prev =>
          prev.map(notif =>
            notif.id === notification.id ? { ...notif, is_read: true } : notif
          )
        );
      }

      // Extract appointment ID from notification message
      const appointmentId = extractAppointmentId(notification.message);

      // Show detailed modal
      setSelectedNotification({ ...notification, appointmentId });
      setShowDetailModal(true);
    } catch (err) {
      console.error('Error handling notification click:', err);
    }
  };

  const extractAppointmentId = (message) => {
    const match = message.match(/appointment #([0-9]+)/i);
    return match ? match[1] : null;
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedNotification(null);
  };

  // Handle opening a specific notification by ID (from push/local notification tap)
  useEffect(() => {
    const pendingId = sessionStorage.getItem('openNotificationId');
    if (!pendingId || notifications.length === 0) return;

    const found = notifications.find((n) => String(n.id) === String(pendingId));
    if (found) {
      handleNotificationClick(found);
      sessionStorage.removeItem('openNotificationId');
    }
  }, [notifications]);

  const handleDeleteNotification = async (e, id) => {
    e.stopPropagation();
    try {
      // Optimistically remove from UI
      setNotifications(prev => prev.filter(n => n.id !== id));
      // Call backend
      await deleteNotification(id);
    } catch (err) {
      console.error('Error deleting notification:', err);
      // Re-fetch if delete fails
      fetchNotifications();
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      // Update all notifications locally
      setNotifications(prev =>
        prev.map(notif => ({ ...notif, is_read: true }))
      );
    } catch (err) {
      console.error('Error marking all notifications as read:', err);
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className={`bg-gray-50 min-h-screen pb-10 relative${isMenuOpen ? ' overflow-hidden max-h-screen' : ''}`}>
      {/* Navbar */}
      <div className="theme-navbar border-b px-4 sm:px-6 py-5 flex items-center justify-between sticky top-0 z-50 transition-all duration-300 pointer-events-auto" style={{ paddingTop: 'max(env(safe-area-inset-top, 0px), 20px)' }}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="p-2 rounded-xl hover:bg-gray-100 transition-colors pointer-events-auto"
        >
          {isMenuOpen ? <X className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} /> : <Menu className="h-6 w-6" style={{ color: 'var(--navbar-text)' }} />}
        </button>
        <h1 className="text-lg font-bold transition-colors" style={{ color: 'var(--navbar-text)' }}>Notifications</h1>
        <button
          onClick={() => onNavigate('home')}
          className="p-2 rounded-xl transition-colors flex items-center justify-center hover:bg-gray-100" style={{ color: 'var(--navbar-text)' }}
        >
          <HomeIcon className="h-5 w-5" />
        </button>
      </div>

      <Sidebar
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        onNavigate={onNavigate}
        currentPage="notifications"
      />

      {/* Header Section */}
      <div className="bg-white px-6 pt-6 pb-4">
        <div className="flex items-center gap-4">
          <div className="bg-white p-3 rounded-2xl shadow-sm border border-gray-100">
            <Bell className="h-12 w-12" style={{ color: theme.secondary }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Notifications</h1>
            <p className="text-gray-500 text-sm font-medium">Stay updated with latest alerts</p>
          </div>
        </div>
      </div>

      {/* Actions Bar */}
      {notifications.length > 0 && (
        <div className="bg-white px-6 py-3 border-b border-gray-100 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-xs font-semibold" style={{ color: theme.primary }}
            >
              Mark all as read
            </button>
          )}
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="px-6 py-8">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error State */}
      {error && !loading && (
        <div className="px-6 py-8">
          <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
            <div className="text-red-600 mb-2">
              <Bell className="h-12 w-12 mx-auto" />
            </div>
            <h3 className="font-bold text-red-800 mb-1">Error Loading Notifications</h3>
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={fetchNotifications}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* No Notifications State */}
      {!loading && !error && notifications.length === 0 && (
        <div className="px-6 py-12">
          <div className="bg-white rounded-2xl p-8 text-center border border-gray-100">
            <div className="bg-gray-100 h-16 w-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Bell className="h-8 w-8 text-gray-400" />
            </div>
            <h3 className="font-bold text-gray-800 mb-2">No notifications yet</h3>
            <p className="text-gray-500 text-sm">
              You'll see important updates here when they arrive
            </p>
            <button
              onClick={() => onNavigate('home')}
              className="mt-4 px-4 py-2 text-white rounded-xl text-sm font-semibold transition-colors btn-brand"
            >
              Back to Home
            </button>
          </div>
        </div>
      )}

      {/* Notifications List */}
      {!loading && !error && notifications.length > 0 && (
        <div className="px-6 py-4 space-y-4">
          {notifications.map((notification) => (
            <div
              key={notification.id}
              onClick={() => handleNotificationClick(notification)}
              className={`relative bg-white rounded-2xl p-5 shadow-sm border border-gray-100 hover:shadow-md hover:border-indigo-100 transition-all cursor-pointer ${!notification.is_read ? 'border-l-4 border-l-indigo-600 bg-indigo-50/30' : ''
                }`}
            >
              {/* Dismiss (X) button */}
              <button
                onClick={(e) => handleDeleteNotification(e, notification.id)}
                className="absolute top-3 right-3 p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-red-500 transition-colors"
                title="Dismiss notification"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start justify-between mb-2 pr-6">
                <h4 className={`font-semibold text-gray-900 ${!notification.is_read ? 'font-bold' : ''}`}>
                  {notification.title}
                </h4>
                {!notification.is_read && (
                  <div className="flex-shrink-0 ml-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: theme.primary }}></div>
                  </div>
                )}
              </div>

              <p className="text-gray-600 text-sm leading-relaxed mb-3">
                {notification.message}
              </p>

              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400 font-medium">
                  {new Date(notification.created_at).toLocaleDateString()} at {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>

                {!notification.is_read && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMarkAsRead(notification.id);
                    }}
                    className="text-xs font-semibold hover:opacity-80 flex items-center gap-1" style={{ color: theme.primary }}
                  >
                    <Check className="h-3 w-3" />
                    Mark as read
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Notification Modal */}
      {showDetailModal && selectedNotification && (() => {
        const doctorName = extractDoctorName(selectedNotification.message);
        const department = extractDepartment(selectedNotification.message);
        const dateTime = extractDateTime(selectedNotification.message);
        const patientName = extractPatientName(selectedNotification.message);

        return (
          <div className="fixed inset-0 z-[999] bg-black/60 flex items-end sm:items-center justify-center" onClick={closeDetailModal}>
            <div
              className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-900">Notification Details</h3>
                <button onClick={closeDetailModal} className="p-1 rounded-full hover:bg-gray-100">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
                {/* Title */}
                <p className="text-sm font-semibold" style={{ color: theme.secondary }}>{selectedNotification.title}</p>

                {/* Patient Name */}
                {patientName && (
                  <div className="rounded-lg p-3" style={{ background: `color-mix(in srgb, ${theme.secondary} 8%, white)` }}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Patient</p>
                    <p className="text-sm font-semibold text-gray-900">{patientName}</p>
                  </div>
                )}

                {/* Doctor Details Card */}
                {(doctorName || department) && (
                  <div className="bg-blue-50 rounded-lg p-3 border-l-4 border-blue-500">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Doctor</p>
                    {doctorName && (
                      <p className="text-sm font-semibold text-blue-900 mb-1">ðŸ‘¨â€âš•ï¸ {doctorName}</p>
                    )}
                    {department && !department.includes('Not specified') && (
                      <p className="text-xs text-blue-700">ðŸ¥ {department}</p>
                    )}
                  </div>
                )}

                {/* Date & Time Card */}
                {dateTime && !dateTime.includes('Not specified') && (
                  <div className="bg-green-50 rounded-lg p-3 border-l-4 border-green-500">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Appointment</p>
                    <p className="text-sm font-semibold text-green-900">ðŸ“… {dateTime}</p>
                  </div>
                )}

                {/* Full Message (for reference) */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Details</p>
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line text-justify">{selectedNotification.message}</p>
                </div>

                {/* Timestamp */}
                <p className="text-xs text-gray-400 text-center pt-2">
                  {new Date(selectedNotification.created_at).toLocaleDateString()} at{' '}
                  {new Date(selectedNotification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-gray-100">
                <button
                  onClick={closeDetailModal}
                  className="w-full py-2.5 text-white rounded-xl font-semibold text-sm transition-colors btn-brand"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};

// Helper functions to extract details from formatted messages
const extractPatientName = (message) => {
  // Pattern: ðŸ‘¤ Patient: [Name]
  const match = message.match(/ðŸ‘¤ Patient:\s*([^\n]+)/i);
  if (match) return match[1].trim();

  // Pattern: Hello [Name],
  const helloMatch = message.match(/Hello\s+([^,]+),/i);
  if (helloMatch) return helloMatch[1].trim();

  return null;
};

const extractDoctorName = (message) => {
  // Pattern: Doctor: Dr. [Name]
  const doctorMatch = message.match(/Doctor:\s*(?:Dr\.\s*)?([^\n]+)/i);
  if (doctorMatch) {
    const name = doctorMatch[1].trim();
    return name.startsWith('Dr.') ? name : `Dr. ${name}`;
  }

  // Pattern: ðŸ‘¨â€âš•ï¸ Doctor: Dr. [Name] or ðŸ‘¨â€âš•ï¸ Referred To: Dr. [Name]
  const emojiMatch = message.match(/ðŸ‘¨â€âš•ï¸\s+(?:Doctor|Referred To):\s*Dr\.\s*([^\n]+)/i);
  if (emojiMatch) return 'Dr. ' + emojiMatch[1].trim();

  // Pattern: with Dr. [Name]
  const withMatch = message.match(/with\s+Dr\.\s*([^\s]+(?:\s+[^\s]+)*)/i);
  if (withMatch) return 'Dr. ' + withMatch[1].trim();

  return null;
};

const formatDate = (dateStr) => {
  try {
    // Handle YYYY-MM-DD format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const date = new Date(dateStr + 'T00:00:00');
      return date.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric'
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
};

const extractDateTime = (message) => {
  // Pattern: Date: [formatted date] and Time: [time]
  const plainDateMatch = message.match(/Date:\s*([^\n]+)/i);
  const plainTimeMatch = message.match(/Time:\s*([^\n]+)/i);

  if (plainDateMatch && plainTimeMatch) {
    const dateStr = plainDateMatch[1].trim();
    const timeStr = plainTimeMatch[1].trim();
    // If dateStr looks like a formatted date, return as-is; otherwise try to format
    return `${dateStr} at ${timeStr}`;
  } else if (plainDateMatch) {
    const dateStr = plainDateMatch[1].trim();
    return dateStr;
  }

  // Pattern: ðŸ“… Previous Date & Time: [date] [time]
  // Pattern: âž¡ï¸ New Date & Time: [date] [time]
  const previousMatch = message.match(/ðŸ“…\s*Previous\s+Date\s+&\s+Time:\s*([^\n]+)/i);
  const newMatch = message.match(/âž¡ï¸\s*New\s+Date\s+&\s+Time:\s*([^\n]+)/i);

  if (previousMatch && newMatch) {
    const prevParts = previousMatch[1].trim().split(/\s+/);
    const newParts = newMatch[1].trim().split(/\s+/);
    const prevDate = prevParts[0];
    const prevTime = prevParts.slice(1).join(' ');
    const newDate = newParts[0];
    const newTime = newParts.slice(1).join(' ');

    return `Previous: ${formatDate(prevDate)} ${prevTime}\nNew: ${formatDate(newDate)} ${newTime}`;
  }

  // Pattern: ðŸ“… Appointment Date: [date]
  // Pattern: ðŸ• Appointment Time: [time]
  const dateMatch = message.match(/ðŸ“…\s*Appointment\s+Date:\s*([^\n]+)/i);
  const timeMatch = message.match(/ðŸ•\s*Appointment\s+Time:\s*([^\n]+)/i);

  if (dateMatch && timeMatch) {
    return `${formatDate(dateMatch[1].trim())} at ${timeMatch[1].trim()}`;
  } else if (dateMatch) {
    return formatDate(dateMatch[1].trim());
  }

  return null;
};

const extractDepartment = (message) => {
  // Pattern: Department: [Department]
  const match = message.match(/Department:\s*([^\n]+)/i);
  if (match) return match[1].trim();
  
  // Pattern: ðŸ¥ Department: [Department]
  const emojiMatch = message.match(/ðŸ¥\s*Department:\s*([^\n]+)/i);
  if (emojiMatch) return emojiMatch[1].trim();
  
  return null;
};

const extractCategory = (message) => {
  // Pattern: ðŸ“‹ Category: [Category]
  const match = message.match(/ðŸ“‹\s*Category:\s*([^\n]+)/i);
  if (match) return match[1].trim();
  return null;
};

export default Notifications;
