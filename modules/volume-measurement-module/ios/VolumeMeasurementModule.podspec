Pod::Spec.new do |s|
  s.name           = 'VolumeMeasurementModule'
  s.version        = '0.1.0'
  s.summary        = 'Native measurement bridge for POC Volume Finder.'
  s.description    = 'Expo native module bridge prepared for future ARCore and ARKit measurement implementations.'
  s.author         = 'POC Volume Finder'
  s.homepage       = 'https://example.invalid/poc-volume-finder'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :path => '.' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ARKit', 'AVFoundation', 'SceneKit', 'UIKit', 'Vision'
  s.source_files = '**/*.{h,m,mm,swift}'
end
