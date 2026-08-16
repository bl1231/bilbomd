import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'

interface MobileControlsShieldProps {
  enabled: boolean
  onEnable: () => void
  onDisable: () => void
}

/**
 * Overlay for touch devices: the Molstar canvas captures pan/zoom gestures,
 * which hijacks page scrolling. The shield sits over the canvas (letting the
 * page scroll normally) until the user explicitly enables 3D controls.
 */
const MobileControlsShield = ({
  enabled,
  onEnable,
  onDisable
}: MobileControlsShieldProps) =>
  enabled ? (
    <Chip
      label='Done'
      onClick={onDisable}
      sx={{
        position: 'absolute',
        top: 8,
        right: 8,
        zIndex: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        color: '#fff'
      }}
    />
  ) : (
    <Box
      onClick={onEnable}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      }}
    >
      <Chip
        label='Tap to enable 3D controls'
        sx={{
          backgroundColor: 'rgba(0, 0, 0, 0.65)',
          color: '#fff'
        }}
      />
    </Box>
  )

export default MobileControlsShield
