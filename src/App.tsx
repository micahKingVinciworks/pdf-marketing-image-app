import React, { useCallback, useRef, useState } from 'react';
import { 
  Container, Typography, Box, Button, Paper, Alert, CircularProgress, Stack,
  TextField, Select, MenuItem, FormControl, InputLabel, Grid, IconButton, Slider
} from '@mui/material';
import { useDropzone } from 'react-dropzone';
import * as pdfjsLib from 'pdfjs-dist';
import DeleteIcon from '@mui/icons-material/Delete';
import ImageIcon from '@mui/icons-material/Image';

// Initialize PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = window.location.origin + '/pdf.worker.min.js';

interface PDFPage {
  pageNum: number;
  imageUrl: string;
}

interface PDFFile {
  file: File;
  pages: PDFPage[];
  selectedPages: {
    left: number | null;
    center: number | null;
    right: number | null;
  };
}

const DEFAULT_BACKGROUND = 'https://firebasestorage.googleapis.com/v0/b/standards-site-beta.appspot.com/o/documents%2Flcsos40lnlj%2Fsoeq3d3monb%2FSTANDARDS%20VW%20COLOURS3.png?alt=media&token=f02400f5-7a12-4e59-b2a4-8e271cfba8bb';

function App() {
  const [pdfFiles, setPdfFiles] = useState<PDFFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [backgroundImage, setBackgroundImage] = useState<string>(DEFAULT_BACKGROUND);
  const [backgroundUrl, setBackgroundUrl] = useState<string>('');
  const [marketingImages, setMarketingImages] = useState<{ [key: string]: string }>({});
  const [overlap, setOverlap] = useState<number>(100);
  const [tiltAngle, setTiltAngle] = useState<number>(15);
  const [pageSize, setPageSize] = useState<number>(400);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const marketingCanvasRef = useRef<HTMLCanvasElement>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    setLoading(true);
    setError(null);

    const newPdfFiles: PDFFile[] = [];
    
    for (const file of acceptedFiles) {
      if (file.type !== 'application/pdf') {
        setError('One or more files are not PDFs.');
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const doc = await loadingTask.promise;
        const pages: PDFPage[] = [];
        const totalPages = doc.numPages;

        for (let i = 1; i <= totalPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d');
          if (!context) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          pages.push({
            pageNum: i,
            imageUrl: canvas.toDataURL('image/png')
          });
        }

        newPdfFiles.push({
          file,
          pages,
          selectedPages: {
            left: pages.length >= 2 ? 2 : 1,
            center: 1,
            right: pages.length >= 3 ? 3 : (pages.length >= 2 ? 2 : 1)
          }
        });
      } catch (e) {
        console.error(`Failed to process ${file.name}:`, e);
        setError(`Failed to process ${file.name}`);
      }
    }

    setPdfFiles(prev => [...prev, ...newPdfFiles]);
    setLoading(false);
  }, []);

  const handleBackgroundUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBackgroundUrl(e.target.value);
  };

  const handleBackgroundUrlSubmit = () => {
    if (backgroundUrl) {
      setBackgroundImage(backgroundUrl);
    }
  };

  const handleBackgroundDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    if (!file.type.match(/^image\/(jpeg|png)$/)) {
      setError('Please upload a JPEG or PNG image.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        setBackgroundImage(e.target.result as string);
      }
    };
    reader.readAsDataURL(file);
  }, []);

  const { getRootProps: getPdfDropProps, getInputProps: getPdfInputProps, isDragActive: isPdfDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true
  });

  const { getRootProps: getBgDropProps, getInputProps: getBgInputProps, isDragActive: isBgDragActive } = useDropzone({
    onDrop: handleBackgroundDrop,
    accept: { 'image/jpeg': ['.jpg', '.jpeg'], 'image/png': ['.png'] },
    multiple: false
  });

  const handlePageSelection = (pdfIndex: number, position: 'left' | 'center' | 'right', pageNum: number) => {
    setPdfFiles(prev => {
      const newFiles = [...prev];
      newFiles[pdfIndex].selectedPages[position] = pageNum;
      return newFiles;
    });
  };

  const removePdf = (index: number) => {
    setPdfFiles(prev => {
      const newFiles = prev.filter((_, i) => i !== index);
      setMarketingImages(prevImages => {
        const newImages = { ...prevImages };
        const removedFile = prev[index];
        if (removedFile) {
          delete newImages[removedFile.file.name];
        }
        return newImages;
      });
      return newFiles;
    });
  };

  const generateMarketingImage = async (pdfFile: PDFFile): Promise<string> => {
    try {
      const canvas = marketingCanvasRef.current;
      if (!canvas) {
        console.error('Canvas element not found');
        throw new Error('Canvas element not found');
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        console.error('Could not get canvas context');
        throw new Error('Could not get canvas context');
      }

      // Set canvas size
      canvas.width = 1280;
      canvas.height = 720;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw background if available
      if (backgroundImage) {
        const bgImg = new Image();
        bgImg.crossOrigin = 'anonymous';
        bgImg.src = backgroundImage;
        await new Promise((resolve, reject) => {
          bgImg.onload = resolve;
          bgImg.onerror = reject;
        });
        const canvasAspect = canvas.width / canvas.height;
        const imgAspect = bgImg.width / bgImg.height;

        let drawWidth, drawHeight, offsetX, offsetY;
        if (imgAspect > canvasAspect) {
          // Image is wider than canvas
          drawHeight = canvas.height;
          drawWidth = bgImg.width * (canvas.height / bgImg.height);
          offsetX = (canvas.width - drawWidth) / 2;
          offsetY = 0;
        } else {
          // Image is taller than canvas
          drawWidth = canvas.width;
          drawHeight = bgImg.height * (canvas.width / bgImg.width);
          offsetX = 0;
          offsetY = (canvas.height - drawHeight) / 2;
        }
        ctx.drawImage(bgImg, offsetX, offsetY, drawWidth, drawHeight);
      }

      // Get selected page images
      const pageImages = await Promise.all(
        ['left', 'center', 'right'].map(async (position) => {
          const pageNum = pdfFile.selectedPages[position as keyof typeof pdfFile.selectedPages];
          if (!pageNum) return null;
          const page = pdfFile.pages.find(p => p.pageNum === pageNum);
          if (!page) return null;
          return page.imageUrl;
        })
      );

      // Page layout settings (larger pages)
      const pageWidth = pageSize;
      const pageHeight = pageSize * 1.5;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2 - (pageHeight / 2);
      const positions = [
        { angle: -tiltAngle * Math.PI / 180, x: centerX - (pageWidth*1.5) + overlap, y: centerY }, // left
        { angle: 0, x: centerX - pageWidth / 2, y: centerY }, // center
        { angle: tiltAngle * Math.PI / 180, x: centerX + (pageWidth/2) - overlap, y: centerY } // right
      ];

      // Draw left and right first, then center on top
      for (const i of [0, 2, 1]) {
        if (pageImages[i]) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = pageImages[i]!;
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
          });
          ctx.save();
          ctx.translate(positions[i].x + pageWidth / 2, positions[i].y + pageHeight / 2);
          ctx.rotate(positions[i].angle);
          ctx.drawImage(img, -pageWidth / 2, -pageHeight / 2, pageWidth, pageHeight);
          ctx.restore();
        }
      }

      // (No label text)

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('Error generating marketing image:', error);
      throw error;
    }
  };

  const handleGenerateImages = async () => {
    setLoading(true);
    const newImages: { [key: string]: string } = {};
    
    for (const pdfFile of pdfFiles) {
      const imageUrl = await generateMarketingImage(pdfFile);
      if (imageUrl) {
        newImages[pdfFile.file.name] = imageUrl;
      }
    }
    
    setMarketingImages(newImages);
    setLoading(false);
  };

  const handleDownload = (fileName: string) => {
    const imageUrl = marketingImages[fileName];
    if (!imageUrl) return;
    
    const link = document.createElement('a');
    link.href = imageUrl;
    link.download = `${fileName.replace('.pdf', '')}-marketing.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom align="center">
        PDF Marketing Image Generator
      </Typography>

      {/* Hidden canvas for image generation */}
      <canvas 
        ref={marketingCanvasRef}
        style={{ display: 'none' }}
      />

      {/* Background Image Selection */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6" gutterBottom>Background Image</Typography>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Box
              {...getBgDropProps()}
              sx={{
                border: '2px dashed #1976d2',
                borderRadius: 2,
                p: 2,
                textAlign: 'center',
                bgcolor: isBgDragActive ? '#e3f2fd' : 'background.paper',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
                backgroundImage: `url(${backgroundImage})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                minHeight: 180,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Box
                sx={{
                  position: 'absolute',
                  inset: 0,
                  bgcolor: 'rgba(255,255,255,0.3)', // 70% background visible
                  zIndex: 1,
                }}
              />
              <Box sx={{ position: 'relative', zIndex: 2 }}>
                <input {...getBgInputProps()} />
                <ImageIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
                <Typography>
                  {isBgDragActive ? 'Drop image here...' : 'Drag and drop a background image (JPEG/PNG)'}
                </Typography>
              </Box>
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Stack spacing={2}>
              <TextField
                label="Or enter image URL"
                value={backgroundUrl}
                onChange={handleBackgroundUrlChange}
                fullWidth
              />
              <Button variant="contained" onClick={handleBackgroundUrlSubmit}>
                Use URL
              </Button>
            </Stack>
          </Grid>
        </Grid>
      </Paper>

      {/* PDF Upload Area */}
      <Box {...getPdfDropProps()} sx={{ 
        border: '2px dashed #1976d2', 
        borderRadius: 2, 
        p: 4, 
        textAlign: 'center', 
        bgcolor: isPdfDragActive ? '#e3f2fd' : 'background.paper', 
        cursor: 'pointer', 
        mb: 2 
      }}>
        <input {...getPdfInputProps()} />
        <Typography variant="body1">
          {isPdfDragActive ? 'Drop PDFs here...' : 'Drag and drop PDF files here, or click to select files'}
        </Typography>
        <Button variant="outlined" sx={{ mt: 2 }} onClick={() => fileInputRef.current?.click()}>
          Choose Files
        </Button>
        <input
          type="file"
          accept="application/pdf"
          multiple
          style={{ display: 'none' }}
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files) {
              onDrop(Array.from(e.target.files));
              e.target.value = '';
            }
          }}
        />
      </Box>

      {/* Uploaded PDFs List */}
      {pdfFiles.length > 0 && (
        <Stack spacing={2} sx={{ my: 2 }}>
          <Typography variant="h6">Uploaded PDFs</Typography>
          {pdfFiles.map((pdfFile, index) => (
            <Paper key={index} sx={{ p: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="subtitle1">{pdfFile.file.name}</Typography>
                <IconButton onClick={() => removePdf(index)} color="error">
                  <DeleteIcon />
                </IconButton>
              </Box>
              
              <Grid container spacing={2}>
                {/* Page Selection */}
                <Grid item xs={12}>
                  <Stack direction="row" spacing={2}>
                    <FormControl fullWidth sx={{ flex: 1 }}>
                      <InputLabel>Left Page</InputLabel>
                      <Select
                        value={pdfFile.selectedPages.left || ''}
                        onChange={(e) => handlePageSelection(index, 'left', Number(e.target.value))}
                        label="Left Page"
                      >
                        {pdfFile.pages.map((page) => (
                          <MenuItem key={page.pageNum} value={page.pageNum}>
                            Page {page.pageNum}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth sx={{ flex: 1 }}>
                      <InputLabel>Center Page</InputLabel>
                      <Select
                        value={pdfFile.selectedPages.center || ''}
                        onChange={(e) => handlePageSelection(index, 'center', Number(e.target.value))}
                        label="Center Page"
                      >
                        {pdfFile.pages.map((page) => (
                          <MenuItem key={page.pageNum} value={page.pageNum}>
                            Page {page.pageNum}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    <FormControl fullWidth sx={{ flex: 1 }}>
                      <InputLabel>Right Page</InputLabel>
                      <Select
                        value={pdfFile.selectedPages.right || ''}
                        onChange={(e) => handlePageSelection(index, 'right', Number(e.target.value))}
                        label="Right Page"
                      >
                        {pdfFile.pages.map((page) => (
                          <MenuItem key={page.pageNum} value={page.pageNum}>
                            Page {page.pageNum}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Stack>
                </Grid>
                {/* Page Width */}
                <Box sx={{ mb: 2 }}>
                  <Typography gutterBottom>Page Width</Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Slider
                      value={pageSize}
                      min={100}
                      max={600}
                      step={1}
                      onChange={(_, value) => setPageSize(value as number)}
                      valueLabelDisplay="auto"
                      sx={{ width: 200 }}
                    />
                    <TextField
                      type="number"
                      value={pageSize}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setPageSize(val);
                      }}
                      inputProps={{ min: 100, max: 600, step: 1 }}
                      size="small"
                      sx={{ width: 80 }}
                    />
                  </Stack>
                </Box>
                {/* Page Overlap */}
                <Box sx={{ mb: 2 }}>
                  <Typography gutterBottom>Page Overlap</Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Slider
                      value={overlap}
                      min={0}
                      max={300}
                      step={1}
                      onChange={(_, value) => setOverlap(value as number)}
                      valueLabelDisplay="auto"
                      sx={{ width: 200 }}
                    />
                    <TextField
                      type="number"
                      value={overlap}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setOverlap(val);
                      }}
                      inputProps={{ min: 0, max: 300, step: 1 }}
                      size="small"
                      sx={{ width: 80 }}
                    />
                  </Stack>
                </Box>
                {/* Tilt Angle */}
                <Box sx={{ mb: 2 }}>
                  <Typography gutterBottom>Tilt Angle</Typography>
                  <Stack direction="row" spacing={2} alignItems="center">
                    <Slider
                      value={tiltAngle}
                      min={0}
                      max={45}
                      step={1}
                      onChange={(_, value) => setTiltAngle(value as number)}
                      valueLabelDisplay="auto"
                      sx={{ width: 200 }}
                    />
                    <TextField
                      type="number"
                      value={tiltAngle}
                      onChange={e => {
                        const val = Number(e.target.value);
                        if (!isNaN(val)) setTiltAngle(val);
                      }}
                      inputProps={{ min: 0, max: 45, step: 1 }}
                      size="small"
                      sx={{ width: 80 }}
                    />
                  </Stack>
                </Box>
              </Grid>
            </Paper>
          ))}

          <Button 
            variant="contained" 
            onClick={handleGenerateImages}
            disabled={loading}
            sx={{ mt: 2 }}
          >
            Generate Marketing Images
          </Button>
        </Stack>
      )}

      {loading && (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
          <CircularProgress />
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ my: 2 }}>{error}</Alert>
      )}

      {/* Generated Marketing Images */}
      {Object.keys(marketingImages).length > 0 && (
        <Stack spacing={2} sx={{ my: 2 }}>
          <Typography variant="h6">Generated Marketing Images</Typography>
          <Grid container spacing={2}>
            {Object.entries(marketingImages).map(([fileName, imageUrl]) => (
              <Grid item xs={12} md={6} key={fileName}>
                <Paper sx={{ p: 2 }}>
                  <Typography variant="subtitle1" gutterBottom>
                    {fileName}
                  </Typography>
                  <img 
                    src={imageUrl} 
                    alt={`Marketing for ${fileName}`}
                    style={{ width: '100%', borderRadius: 8, marginBottom: 16 }} 
                  />
                  <Button 
                    variant="contained" 
                    onClick={() => handleDownload(fileName)}
                    fullWidth
                  >
                    Download
                  </Button>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}
    </Container>
  );
}

export default App;